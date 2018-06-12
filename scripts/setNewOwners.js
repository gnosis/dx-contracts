/**
 * node scritps/setNewOwner.js
 * to set new owners after the deployement script run
 * @flags:
 * --network                    if not specified, testrpc will be used. Otherwise rinkeby
 * --newOwner            address of the new owner
 */

const Web3 = require('web3')
const fs = require('fs')
const argv = require('minimist')(process.argv.slice(2), { string: 'a', string: ['newOwner']})

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
const PriceOracleInterfaceJson = JSON.parse(fs.readFileSync('./build/contracts/PriceOracleInterface.json'))
const PriceOracleInterface = TruffleContract(PriceOracleInterfaceJson)
const TokenFRTJson = JSON.parse(fs.readFileSync('./build/contracts/TokenFRT.json'))
const TokenFRT = TruffleContract(TokenFRTJson)
const TokenOWLJson = JSON.parse(fs.readFileSync('./build/contracts/TokenOWL.json'))
const TokenOWL = TruffleContract(TokenOWLJson)
const TokenOWLProxyJson = JSON.parse(fs.readFileSync('./build/contracts/TokenOWLProxy.json'))
const TokenOWLProxy = TruffleContract(TokenOWLProxyJson)

DutchExchange.setProvider(web3.currentProvider)
Proxy.setProvider(web3.currentProvider)
PriceOracleInterface.setProvider(web3.currentProvider)
TokenFRT.setProvider(web3.currentProvider)
TokenOWL.setProvider(web3.currentProvider)
TokenOWLProxy.setProvider(web3.currentProvider)

module.exports = (async () => {
  const promisedAcct = new Promise((resolve, reject) => web3.eth.getAccounts((e, r) => a(r[0])))

  // Test VARS
  let dx
  try {
    const acct = await promisedAcct
    const proxy = await Proxy.deployed()
    const frt = await TokenFRT.deployed()
    const owlProxy = TokenOWLProxy.deployed()
    const owl = TokenOWL.at(owlProxy.address)
    const dx = DutchExchange.at(proxy.address)
    const priceOracleInterface = await PriceOracleInterface.deployed()

    if (argv.newOwner.length != 42) {
      throw ('No correct new owner specified')
    }
    await dx.updateAuctioneer(argv.newOwner, {from: acct})
    await priceOracleInterface.updateCurator(argv.newOwner, {from: acct})
    await frt.updateOwner(proxy.address, {from: acct})
    await owl.setNewOwner(argv.newOwner, {from: acct})

    console.log(`
    ===========================
    Successfully updated the owner to  => [${argv.newOwner}] 
    `)

    return
  } catch (error) {
    throw new Error(error)
  }
  process.exit(0)
})()
