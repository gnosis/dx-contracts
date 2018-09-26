/* global artifacts, web3 */
/* eslint no-undef: "error" */

const assert = require('assert')

const GAS = 5e5 // 500K
const DEFAULT_GAS_PRICE_GWEI = 5 // 5 GWei

// Usage example:
//  yarn MNEMONIC="secret mnemonic" yarn claim-unlocked-mgn --network rinkeby --dry-run
//  yarn MNEMONIC="secret mnemonic" yarn claim-unlocked-mgn --network rinkeby
var argv = require('yargs')
  .usage('Usage: yarn claim-unlocked-mgn [--gas-price num] [--network name] [--dry-run]')
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
    console.log('\n **************  Claim unlocked MGN  **************\n')
    console.log(`Data:
    Dry run: ${dryRun ? 'Yes' : 'No'}
    Network: ${network}
    Gas: ${GAS}
    Gas Price: ${gasPrice} GWei`)
    
    // Load the DX info
    const { mgn, dx, account } = await loadContractsInfo()
    const [ amountUnlocked, withdrawalTimeSeconds ] = await mgn.unlockedTokens(account)
    const withdrawalTime = new Date(withdrawalTimeSeconds.toNumber() * 1000)
    const withdrawalTimeFmt = withdrawalTime.toLocaleDateString() + ' ' +
    withdrawalTime.getHours() + ':' + withdrawalTime.getMinutes()

    console.log(`\
    User account: ${account}
    DutchX address: ${dx.address}
    MGN address: ${mgn.address}

    Currently unlocked MGN: ${amountUnlocked.div(1e18)}
    Withdraw time for unlocked MGN: ${withdrawalTimeFmt}
`)

    const now = new Date()
    if (amountUnlocked.isZero()) {
      console.log(`The user doesn't have any unlocked MGN`)
    } else if (withdrawalTime > now) {
      console.log(`The user has unlockded MGN, but is not claimable yet`)
    } else {
      // Ready to claim
      if (dryRun) {
        // Dry run
        console.log('The dry run execution passed all validations')
        await mgn.withdrawUnlockedTokens.call({
          from: account
        })
        console.log('Dry run success!')
      } else {
        // Real add token pair execution
        console.log('Changing auctioneer to: ' + newAuctioneer)
        const txResult = await mgn.withdrawUnlockedTokens({
          from: account,
          gas: GAS,
          gasPrice: gasPrice * 1e9
        })
        console.log(`Success! ${amountUnlocked.div(1e18)} has been unlocked. Transaction: ${txResult.tx}`)
      }
    }
    console.log('\n **************  Claim unlocked MGN  **************\n')
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
