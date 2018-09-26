/* global artifacts, web3 */
/* eslint no-undef: "error" */

const assert = require('assert')

const GAS = 5e5 // 500K
const DEFAULT_GAS_PRICE_GWEI = 5 // 5 GWei

// Usage example:
//  yarn MNEMONIC="secret mnemonic" yarn unlock-mgn --network rinkeby --dry-run
//  yarn MNEMONIC="secret mnemonic" yarn unlock-mgn --network rinkeby
var argv = require('yargs')
  .usage('Usage: yarn unlock-mgn [--gas-price num] [--network name] [--dry-run]')
  .option('gasPrice', {
    type: 'integer',
    default: process.env.GAS_PRICE_GWEI || DEFAULT_GAS_PRICE_GWEI,
    describe: 'Gas price for adding each token pair'
  })
  .option('network', {
    type: 'string',
    default: 'development',
    describe: 'One of the ethereum networks defined in truffle config'
  })
  .option('dryRun', {
    type: 'boolean',
    default: false,
    describe: 'Dry run. Do not add the token pair, do just the validations.'
  })
  .help('h')
  .strict()
  .argv

async function setAuctioneer () {
  if (!argv._[0]) {
    argv.showHelp()
  } else {
    const { gasPrice, network, dryRun, auctioneer: newAuctioneer } = argv
    console.log('\n **************  Unlock MGN  **************\n')
    console.log(`Data:
    Dry run: ${dryRun ? 'Yes' : 'No'}
    Network: ${network}
    Gas: ${GAS}
    Gas Price: ${gasPrice} GWei`)
    
    // Load the DX info
    const { mgn, dx, account } = await loadContractsInfo()
    const lockedAmount = await mgn.lockedTokenBalances(account)
    console.log(`\
    User account: ${account}
    DutchX address: ${dx.address}
    MGN address: ${mgn.address}

    currently locked MGN: ${lockedAmount.div(1e18)}
`)

    if (!lockedAmount.isZero()) {
      if (dryRun) {
        // Dry run
        console.log('The dry run execution passed all validations')
        await mgn.unlockTokens.call(lockedAmount, {
          from: account
        })
        console.log('Dry run success!')
      } else {
        // Real add token pair execution
        console.log('Changing auctioneer to: ' + newAuctioneer)
        const txResult = await mgn.unlockTokens(lockedAmount, {
          from: account,
          gas: GAS,
          gasPrice: gasPrice * 1e9
        })
        console.log(`Success! ${lockedAmount.div(1e18)} has been unlocked.
They will be withdrawable in 24h.
Transaction: ${txResult.tx}`)
      }
    } else {
      console.log(`The user doesn't have any locked MGN`)
    }



    console.log('\n **************  Unlock MGN  **************\n')
  }
}

async function loadContractsInfo () {
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')
  const DutchExchange = artifacts.require('DutchExchange')
  const TokenFRT = artifacts.require('TokenFRT')

  // Get contract examples
  const dxProxy = await DutchExchangeProxy.deployed()
  const dx = DutchExchange.at(dxProxy.address)
  const mgn = await TokenFRT.deployed()

  // get Accounts
  const accounts = await new Promise((resolve, reject) => {
    web3.eth.getAccounts((error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result)
      }
    })
  })

  return {
    mgn,
    dx,
    account: accounts[0]
  }
}

module.exports = callback => {
  setAuctioneer()
    .then(callback)
    .catch(callback)
}
