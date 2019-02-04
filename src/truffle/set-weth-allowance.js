/* global artifacts, web3 */
/* eslint no-undef: "error" */

const assert = require('assert')
const contract = require('truffle-contract')

const GAS = 5e5 // 500K

// Usage example:
//  PK=PRIVATE_KEY yarn set-weth-allowance --amount 40 --dry-run
var argv = require('yargs')
  .usage('Usage: yarn set-weth-allowance [--amount wethAmount] [--network name] [--dry-run]')
  .option('amount', {
    type: 'integer',
    describe: 'Amount of WETH to set as the new allowance',
    demandOption: true
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

async function setWethAllowance () {
  if (!argv._[0]) {
    argv.showHelp()
  } else {
    const { network, amount, dryRun } = argv
    console.log('\n **************  Set WETH Allowance  **************\n')
    console.log(`Data:
    Dry run: ${dryRun ? 'Yes' : 'No'}
    Network: ${network}
    Gas: ${GAS}
`)

    // Load the DX info
    const { weth, dx, account, etherBalance } = await loadContractsInfo()
    const wethBalance = await weth.balanceOf(account)
    const oldAllowance = await weth.allowance(account, dx.address)
    const wethBalanceInDx = await dx.balances(weth.address, account)

    console.log(`\
    Addresses:
        DutchX address: ${dx.address}
        WETH address: ${weth.address}
    Account: ${account}    
    Balances:
        Balance of Ether: ${etherBalance / 1e18}
        Balance of WETH: ${wethBalance / 1e18}
        Balance of WETH in DutchX: ${wethBalanceInDx / 1e18}
    Old Allowance: ${oldAllowance / 1e18}
    New Allowance: ${amount}
`)

    if (dryRun) {
      // Dry run
      console.log('The dry run execution passed all validations')
      await weth.approve.call(dx.address, amount * 1e18, {
        from: account
      })
      console.log('Dry run success!')
    } else {
      // Real wrap WETH
      console.log('Setting the allowance to %s for WETH', amount)
      const setAllowanceResult = await weth.approve(dx.address, amount * 1e18, {
        from: account
      })
      console.log('Success! The allowance is now %s. Transaction: %s', amount, setAllowanceResult.tx)
    }

    console.log('\n **************  Set WETH Allowance  **************\n')
  }
}

async function loadContractsInfo () {
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')
  const DutchExchange = artifacts.require('DutchExchange')

  const EtherToken = contract(require('@gnosis.pm/util-contracts/build/contracts/EtherToken'))
  EtherToken.setProvider(web3.currentProvider)

  // Get contract examples
  const dxProxy = await DutchExchangeProxy.deployed()
  const dx = DutchExchange.at(dxProxy.address)
  const weth = await EtherToken.deployed()

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

  const account = accounts[0]
  const etherBalance = await new Promise((resolve, reject) => {
    web3.eth.getBalance(account, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result)
      }
    })
  })

  return {
    weth,
    dx,
    etherBalance,
    account
  }
}

module.exports = callback => {
  setWethAllowance()
    .then(callback)
    .catch(callback)
}
