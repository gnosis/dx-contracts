/**
 * node scritps/approveTokenForDutchX.js
 * to add a new TradingPair ETH:Token to the DutchExchange
 * @flags:
 * --network                    if not specified, testrpc will be used. Otherwise rinkeby
 * --tokenToApprove             any token that inherits the StandartToken functions can be submitted
 * --Approved                    bool variable
 */

const Web3 = require('web3')
const fs = require('fs')
const argv = require('minimist')(process.argv.slice(2), { string: 'a', string: ['tokenToApprove', 'Approved']})

// optional for MNEMONICs
// const mnemonic = process.env.MNEMONIC // Mnemonic for account
// const HDWalletProvider = require('truffle-hdwallet-provider')
// const provider = new HDWalletProvider(process.env.MNEMONIC, 'https://rinkeby.infura.io/')

const privKey = process.env.PrivateKEY // raw private key
const HDWalletProvider = require('truffle-hdwallet-provider-privkey')

let web3, provider
if (argv.network) {
  if (argv.network == 'rinkeby') { provider = new HDWalletProvider(privKey, 'https://rinkeby.infura.io/') } else if (argv.network == 'kovan') {
    provider = new HDWalletProvider(privKey, 'https://kovan.infura.io/')
  } else if (argv.network == 'mainnet') {
    provider = new HDWalletProvider(privKey, 'https://mainnet.infura.io/')
  }
  web3 = new Web3(provider.engine)
} else {
  web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
}

const TruffleContract = require('truffle-contract')

// retrieve truffle-contracts
const ProxyJson = JSON.parse(fs.readFileSync('./build/contracts/Proxy.json'))
const Proxy = TruffleContract(ProxyJson)
const DutchExchangeJson = JSON.parse(fs.readFileSync('./build/contracts/DutchExchange.json'))
const DutchExchange = TruffleContract(DutchExchangeJson)

DutchExchange.setProvider(web3.currentProvider)
Proxy.setProvider(web3.currentProvider)

module.exports = (async () => {
  const promisedAcct = new Promise((resolve, reject) => web3.eth.getAccounts((e, r) => a(r[0])))

  // Test VARS
  let dx
  try {
    const acct = await promisedAcct
    const proxy = await Proxy.deployed()
    const dx = DutchExchange.at(proxy.address)
    if (argv.tokenToApprove.length != 42) {
      throw ('No token address specified')
    }
    if (argv.Approved.length == 4) // equals 'true'
    { await dx.updateApprovalOfToken([argv.tokenToApprove], true, {from: acct}) } else {
      await dx.updateApprovalOfToken([argv.tokenToApprove], false, {from: acct})
    }
    console.log(`
    ===========================
    Successfully approved the Token  => [${argv.tokenToApprove}] 
    New approval status of Token  => [${await dx.approvedTokens.call(argv.tokenToApprove)}] 
    `)
    return
  } catch (error) {
    throw new Error(error)
  }
  process.exit(0)
})()
