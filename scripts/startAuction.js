// script crashes for gas reason sometimes, if it is run against testrpc. with kovan or rinkeby, there were no porblems dectected.

const Web3 = require('web3')
const fs = require('fs')


//optional for private keys
/*
const HDWalletProvider = require("truffle-hdwallet-provider-privkey");
const privKey = "process.env.PrivateKEY // raw private key
const provider = new HDWalletProvider(privKey, "https://kovan.infura.io/");
*/

const HDWalletProvider = require('truffle-hdwallet-provider')
const mnemonic = process.env.MNEMONIC
const provider = new HDWalletProvider(mnemonic, 'https://rinkeby.infura.io/')
//const provider = new HDWalletProvider(mnemonic, 'http://localhost:8545')
// important: gas needs to specified for ganache with local test net for whatever reason.
web3 = new Web3(provider.engine)
const TruffleContract = require('truffle-contract')

// retrieve truffle-contracts 
const EtherTokenJson = JSON.parse(fs.readFileSync('./build/contracts/EtherToken.json'))
const EtherToken = TruffleContract(EtherTokenJson)
const TokenOMGJson = JSON.parse(fs.readFileSync('./build/contracts/TokenOMG.json'))
const TokenOMG = TruffleContract(TokenOMGJson)
const TokenRDNJson = JSON.parse(fs.readFileSync('./build/contracts/TokenRDN.json'))
const TokenRDN = TruffleContract(TokenRDNJson)
const ProxyJson = JSON.parse(fs.readFileSync('./build/contracts/Proxy.json'))
const Proxy = TruffleContract(ProxyJson)
const DutchExchangeJson = JSON.parse(fs.readFileSync('./build/contracts/DutchExchange.json'))
const DutchExchange = TruffleContract(DutchExchangeJson)

EtherToken.setProvider(web3.currentProvider)
DutchExchange.setProvider(web3.currentProvider)
Proxy.setProvider(web3.currentProvider)
TokenOMG.setProvider(web3.currentProvider)
TokenRDN.setProvider(web3.currentProvider)

// Test VARS
let eth
let gno
let rdn
let dx
let Token

const startingETH = 18e18
const startingToken = 100e18

const getContracts = async () => {
  eth = await EtherToken.deployed()
  omg = await TokenOMG.deployed()
  rdn = await TokenRDN.deployed()
  const proxy = await Proxy.deployed()
  dx = DutchExchange.at(proxy.address)
  return {
    EtherToken: eth,
    TokenOMG: omg,
    TokenRDN: rdn,
    DutchExchange: dx,
  }
}
const setup = async () => {
  await eth.deposit({ from: acct, value: startingETH })
  await eth.approve(dx.address, startingETH, { from: acct })
  await tokenToAdd.approve(dx.address, startingToken+20, { from: acct })
  await dx.deposit(tokenToAdd.address, startingToken, { from: acct, gas: 234254})
  await dx.deposit(eth.address, startingETH, { from: acct, gas: 234254})
}

const p = new Promise((resolve, reject) => {
  web3.eth.getAccounts((error, result) => {
    resolve(result)
  })
})

// parameters for deployment
let acct
let tokenToAdd
p.then((a) => {
  acct = a[0]
  return getContracts()
})
  .then((c) => {
    eth = c.EtherToken
    tokenToAdd = c.TokenRDN
    dx = c.DutchExchange
    return setup()})
  .then(() => dx.balances(eth.address, acct))
  .then((t) => {
    return dx.getAuctionIndex(eth.address, tokenToAdd.address)
  })
  .then((t) => {
    return dx.addTokenPair(eth.address, tokenToAdd.address, startingETH, 0, 1, 50, { from: acct, gas: 2374235})
  })
