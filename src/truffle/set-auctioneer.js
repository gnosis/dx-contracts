/* global artifacts, web3 */
/* eslint no-undef: "error" */

const assert = require('assert')

const GAS = 5e5 // 500K
const DEFAULT_GAS_PRICE_GWEI = 5 // 5 GWei

// Usage example:
//  yarn set-auctioneer --auctioneer 0x1 --dry-run
//  yarn set-auctioneer --auctioneer 0x1
var argv = require('yargs')
  .usage('Usage: yarn set-auctioner [--auctioneer newAddress] [--gas-price num] [--network name] [--dry-run]')
  .option('auctioneer', {
    type: 'string',
    describe: 'New auctioneer'
  })
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
    console.log('\n **************  Set auctioneer  **************\n')
    console.log(`Data:
    Dry run: ${dryRun ? 'Yes' : 'No'}
    Network: ${network}
    Gas: ${GAS}
    Gas Price: ${gasPrice} GWei`)

    // Load the DX info
    const { auctioneer, dx, account } = await loadContractsInfo()
    console.log(`\
    User account: ${account}
    DutchX Auctioneer: ${auctioneer}
    DutchX address: ${dx.address}

    Set auctioneer to: ${newAuctioneer}
`)
    assert(newAuctioneer, 'auctioneer is a required param')

    if (auctioneer !== newAuctioneer) {
      assert.equal(account, auctioneer, 'Only the auctioneer can update the auctioneer. Check the account you are using')
      
      const params = {
        gasPrice,
        dryRun
      }

      if (dryRun) {
        // Dry run
        console.log('The dry run execution passed all validations')
        await dx.updateAuctioneer.call(newAuctioneer, {
          from: account
        })
        console.log('Dry run success!')
      } else {
        // Real add token pair execution
        console.log('Changing auctioneer to: ' + newAuctioneer)
        const addTokenResult = await dx.updateAuctioneer(newAuctioneer, {
          from: account,
          gas: GAS,
          gasPrice: gasPrice * 1e9
        })
        console.log('Success! The token pair was added. Transaction: ' + addTokenResult.tx)
      }
    } else {
      console.log(`The auctioneer is already ${newAuctioneer}. So, there nothing to do`)
    }



    console.log('\n **************  Set auctioneer  **************\n')
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
    auctioneer,
    accounts
  ] = await Promise.all([
    // Get the auctioneer
    dx.auctioneer.call(),

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

  return {
    auctioneer,
    dx,
    account: accounts[0]
  }
}

module.exports = callback => {
  setAuctioneer()
    .then(callback)
    .catch(callback)
}
