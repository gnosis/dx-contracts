const path = require('path')
                     
const DEFAULT_GAS = 5e5 // 500K
const DEFAULT_GAS_PRICE = 1e9
// How many tokens we approve at once
const DEFAULT_BATCH = 50

// Usage example:
//  yarn approve-tokens -h
//  yarn approve-tokens -f ./test/resources/approve-tokens/rinkeby/approve-tokens/top150tokens.js --dry-run
//  yarn approve-tokens -f ./test/resources/approve-tokens/rinkeby/approve-tokens/top150tokens.js

var argv = require('yargs')
    .usage('Usage: yarn approve-tokens -f <file> [--gas num] [--gas-price num] [--network name] [--dry-run] [--batch-size]')
    .option('f', {
      type: 'string',
      demandOption: true,
      describe: 'File with the list of tokens to approve'
    })
    .option('gas', {
      type: 'integer',
      default: DEFAULT_GAS,
      describe: 'Gas for approving each token'
    })
    .option('gasPrice', {
      type: 'integer',
      default: DEFAULT_GAS_PRICE,
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
    .argv;

async function approveTokens () {
  if (!argv._[0]) {
    cli.showHelp()
  } else {
    const { f, gas, gasPrice, network, dryRun, batchSize } = argv
      const tokensFile = path.join('..', f)
      console.log('\n **************  Approve tokens  **************\n')  
      console.log(`Data:
    Dry run: ${dryRun ? 'Yes' : 'No'}
    Network: ${network}
    Tokens file: ${f}
    Gas: ${gas}
    Gas Price: ${gasPrice / 1e9} GWei
    Batch size: ${batchSize}`)
      // Load the file
      const tokens = require(tokensFile)
  
      // Load the DX contract
      const contractsInfo = await loadContractsInfo()
      console.log(`\
    Deployer account: ${contractsInfo.account}
    DX address: ${contractsInfo.dx.address}
    WETH address: ${contractsInfo.wethAddress}
    Ether balance: ${contractsInfo.etherBalance}    
    Threshold: $${contractsInfo.thresholdInUSD.toFixed(2)}
    Current Ether price: ${contractsInfo.etherPrice}
`)

    const params = {
      gas,
      gasPrice,
      network,
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

    await approveAndDisapprove(contractInfo, params, tokensToApprove, tokensToDisapprove)

    console.log('\n **************  End of approve & disapprove tokens  **************\n')
  }
}

async function approveAndDisapprove (contractsInfo, params, tokensToApprove, tokensToDisapprove) {
  
  const { gas, gasPrice, network, dryRun, batchSize } = params
  const {
    dx,
    etherPrice,
    wethAddress,
    thresholdInUSD,
    StandardToken,
    account
  } = contractsInfo


  const printTokenInfo = ({ symbol, address }, approve, approved) => {
    let text
    if (approve == approved) {
      text = approve ? 'Token already approved:' : 'Token already disapproved:'
    } else {
      text = approve ? 'Approving token:' : 'Disapproving token:'
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
      addressesToApprove[j] = token.address
    } else {
      printTokenInfo(token, true, true)
    }
  }

  for (let j = 0; j < tokensToDisapprove.length; j++) {
    const token = tokensToApprove[j]
    const approved = await dx.approvedTokens.call(token.address)
    if (approved) {
      printTokenInfo(token, false, true)
      addressesToDisapprove[j] = token.address
    } else {
      printTokenInfo(token, false, false)
    }
  }

  if (dryRun) {
    // Dry run
    console.log("The dry run execution passed all validations")

    for (let j = 0; j < tokensToApprove.length / batchSize; j++) {
      const batch = tokensToApprove.slice(j * batchSize, (j + 1) * batchSize)
      await dx.updateApprovalOfToken.call(
        batch, true {
        from: account
      })
    }

    for (let j = 0; j < tokensToDisapprove.length / batchSize; j++) {
      const batch = tokensToDisapprove.slice(j * batchSize, (j + 1) * batchSize)
      await dx.updateApprovalOfToken.call(
        batch, false {
        from: account
      })
    }

    console.log('Dry run success!')
  } else {
    // Real add token pair execution
    console.log("Approving tokens with account: " + account)

    for (let j = 0; j < tokensToApprove.length / batchSize; j++) {
      const batch = tokensToApprove.slice(j * batchSize, (j + 1) * batchSize)
      const approveTokens = await dx.updateApprovalOfToken(
        batch, true {
        from: account,
        gas,
        gasPrice
      })
      console.log(`Success! The ${j}th batch of tokens was approved. Transaction: ${approveTokens.tx}`)
    }

    for (let j = 0; j < tokensToDisapprove.length / batchSize; j++) {
      const batch = tokensToDisapprove.slice(j * batchSize, (j + 1) * batchSize)
      const disapproveTokens = await dx.updateApprovalOfToken(
        batch, false {
        from: account,
        gas,
        gasPrice
      })
      console.log(`Success! The ${j}th batch of tokens was disapproved. Transaction: ${disapproveTokens.tx}`)
    }
  }
}

async function loadContractsInfo () {
  const Proxy = artifacts.require('Proxy')
  const DutchExchange = artifacts.require('DutchExchange')
  const StandardToken = artifacts.require('StandardToken')
  const PriceOracleInterface = artifacts.require('PriceOracleInterface')

  // Get contract examples
  const proxy = await Proxy.deployed()
  const dx = DutchExchange.at(proxy.address)  

  // Get some data from dx
  const [
    wethAddress,
    thresholdInUSD,
    ethUSDOracleAddress,
    accounts
  ] = await Promise.all([
    // Get weth address
    dx.ethToken.call(),

    // Get threshold in USD
    dx.thresholdNewTokenPair
      .call()
      .then(thresholdInWei => thresholdInWei.div(1e18)),

    // Get oracle address
    dx.ethUSDOracle.call(),

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
  
  // Get ether price from oracle
  const oracle = PriceOracleInterface.at(ethUSDOracleAddress)
  const etherPrice = await oracle.getUSDETHPrice.call()

  // Get the ether balance
  const account = accounts[0]
  const etherBalance = await new Promise((resolve, reject) => {
    web3.eth.getBalance(account, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result.div(1e18))
      }
    })
  })

  return {
    dx,
    etherPrice,
    wethAddress,
    etherBalance,
    thresholdInUSD,
    StandardToken,
    account
  }
}

module.exports = (callback) => {  
  approveTokens()
    .then(() => {      
      console.log('Success! All token pairs has been added\n')
      callback()
    })
    .catch(error => {
      callback(error)
    })
}
