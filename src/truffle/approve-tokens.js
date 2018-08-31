/* global artifacts, web3 */
/* eslint no-undef: "error" */

const path = require('path')

const GAS = 16e5 // 800K
const DEFAULT_GAS_PRICE_GWEI = 50
// How many tokens we approve at once
const DEFAULT_BATCH = 50

// Usage example:
//  yarn approve-tokens -h
//  MNEMONIC="your mnemonic here.." yarn approve-tokens -f test/resources/approve-tokens/top150tokens.js --network rinkeby --dry-run
//  MNEMONIC="your mnemonic here.." yarn approve-tokens -f test/resources/approve-tokens/top150tokens.js --network rinkeby

var argv = require('yargs')
  .usage('Usage: yarn approve-tokens -f <file> [--gas num] [--gas-price num] [--network name] [--dry-run] [--batch-size num]')

  .option('f', {
    type: 'string',
    demandOption: true,
    describe: 'File with the list of tokens to approve'
  })
  .option('gasPrice', {
    type: 'integer',
    default: process.env.GAS_PRICE_GWEI || DEFAULT_GAS_PRICE_GWEI,
    describe: 'Gas price for approving each token'
  })
  .option('network', {
    type: 'string',
    default: 'development',
    describe: 'One of the ethereum networks defined in truffle config'
  })
  .option('dryRun', {
    type: 'boolean',
    default: false,
    describe: 'Dry run. Do not approve the token, do just the validations.'
  })
  .option('batchSize', {
    type: 'integer',
    default: DEFAULT_BATCH,
    describe: 'How many tokens are approved at once'
  })
  .help('h')
  .strict()
  .argv

async function approveTokens () {
  if (!argv._[0]) {
    argv.showHelp()
  } else {
    const { f, gas, gasPrice, network, dryRun, batchSize } = argv
    const tokensFile = path.join('../..', f)
    console.log('\n **************  Approve tokens  **************\n')
    console.log(`Data:
    Dry run: ${dryRun ? 'Yes' : 'No'}
    Network: ${network}
    Tokens file: ${f}
    Gas: ${gas}
    Gas Price: ${gasPrice} GWei
    Batch size: ${batchSize}`)

    // Load the file
    const tokens = require(tokensFile)

    // Load the DX contract
    const contractsInfo = await loadContractsInfo()
    console.log(`\
    User account: ${contractsInfo.account}
    DX address: ${contractsInfo.dx.address}
`)

    const params = {
      gasPrice,
      dryRun,
      batchSize
    }

    const tokensToApprove = []
    const tokensToDisapprove = []

    for (var i = 0; i < tokens.length; i++) {
      // Add all tokens (syncronously)

      if (tokens[i].approve) {
        tokensToApprove.push(tokens[i])
      } else {
        tokensToDisapprove.push(tokens[i])
      }
    }

    await approveAndDisapprove(contractsInfo, params, tokensToApprove, tokensToDisapprove)

    console.log('\n **************  End of approve & disapprove tokens  **************\n')
  }
}

async function approveAndDisapprove (contractsInfo, params, tokensToApprove, tokensToDisapprove) {
  const { gasPrice, dryRun, batchSize } = params
  const { dx, account } = contractsInfo

  const printTokenInfo = ({ symbol, address }, approve, approved) => {
    let text
    if (approve === approved) {
      text = approve ? 'Token already approved' : 'Token already disapproved'
    } else {
      text = approve ? 'Approving token' : 'Disapproving token'
    }
    console.log(`${text}:
    Symbol: ${symbol}
    Address: ${address}`)
  }

  const addressesToApprove = []
  const addressesToDisapprove = []

  // Check if tokens approved, print logs and add addresses
  for (let j = 0; j < tokensToApprove.length; j++) {
    const token = tokensToApprove[j]
    const approved = await dx.approvedTokens.call(token.address)
    if (!approved) {
      printTokenInfo(token, true, false)
      addressesToApprove.push(token.address)
    } else {
      printTokenInfo(token, true, true)
    }
  }

  for (let j = 0; j < tokensToDisapprove.length; j++) {
    const token = tokensToDisapprove[j]
    const approved = await dx.approvedTokens.call(token.address)
    if (approved) {
      printTokenInfo(token, false, true)
      addressesToDisapprove.push(token.address)
    } else {
      printTokenInfo(token, false, false)
    }
  }

  if (dryRun) {
    // Dry run
    console.log('The dry run execution passed all validations')

    console.log(`Approving ${addressesToApprove.length} tokens with account: ${account}`)
    for (let j = 0; j < addressesToApprove.length / batchSize; j++) {
      const batch = addressesToApprove.slice(j * batchSize, (j + 1) * batchSize)
      await dx.updateApprovalOfToken.call(batch, true, {
        from: account
      })
    }

    console.log(`Disapproving ${addressesToDisapprove.length} tokens with account: ${account}`)
    for (let j = 0; j < addressesToDisapprove.length / batchSize; j++) {
      const batch = addressesToDisapprove.slice(j * batchSize, (j + 1) * batchSize)
      await dx.updateApprovalOfToken.call(batch, false, {
        from: account
      })
    }

    console.log('Dry run success!')
  } else {
    // Real add token pair execution
    console.log(`Approving ${addressesToApprove.length} tokens with account: ${account}`)
    for (let j = 0; j < addressesToApprove.length / batchSize; j++) {
      const startIndex = j * batchSize
      const count = (j + 1) * batchSize
      const tokenAddressesBatch = addressesToApprove.slice(startIndex, count)
      console.log(`Approving ${j + 1}th batch of tokens: From ${startIndex} to ${startIndex + count}: ${tokenAddressesBatch.length} addresses`)
      // console.log(tokenAddressesBatch)
      const approveTokens = await dx.updateApprovalOfToken(tokenAddressesBatch, true, {
        from: account,
        gas: GAS,
        gasPrice: gasPrice * 1e9
      })
      console.log(`Success! The ${j + 1}th batch of tokens was approved. Transaction: ${approveTokens.tx}`)
    }

    console.log(`Disapproving ${addressesToDisapprove.length} tokens with account: ${account}`)
    for (let j = 0; j < addressesToDisapprove.length / batchSize; j++) {
      // TODO: Refactor
      const startIndex = j * batchSize
      const count = (j + 1) * batchSize
      const tokenAddressesBatch = addressesToDisapprove.slice(startIndex, count)
      console.log(`Disapproving ${j + 1}th batch of tokens: From ${startIndex} to ${startIndex + count}: ${tokenAddressesBatch.length} addresses`)
      const disapproveTokens = await dx.updateApprovalOfToken(tokenAddressesBatch, false, {
        from: account,
        gas: GAS,
        gasPrice: gasPrice * 1e9
      })
      console.log(`Success! The ${j + 1}th batch of tokens was disapproved. Transaction: ${disapproveTokens.tx}`)
    }
  }
}

async function loadContractsInfo () {
  const Proxy = artifacts.require('DutchExchangeProxy')
  const DutchExchange = artifacts.require('DutchExchange')

  // Get contract examples
  const proxy = await Proxy.deployed()
  const dx = DutchExchange.at(proxy.address)

  // Get some data from dx
  const [
    accounts
  ] = await Promise.all([

    // get Accounts
    new Promise((resolve, reject) => {
      web3.eth.getAccounts((error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })
    })
  ])

  const account = accounts[0]
  return {
    dx,
    account
  }
}

module.exports = callback => {
  approveTokens()
    .then(callback)
    .catch(callback)
}
