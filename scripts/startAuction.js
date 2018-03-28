// @ts-check
// script crashes for gas reason sometimes, if it is run against testrpc. with kovan or rinkeby, there were no porblems dectected.

const Web3 = require('web3')
const fs = require('fs')
const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

//optional for private keys
/*
const HDWalletProvider = require("truffle-hdwallet-provider-privkey");
const privKey = "process.env.PrivateKEY // raw private key
const provider = new HDWalletProvider(privKey, "https://kovan.infura.io/");
*/

let web3
if (argv.network) {
  const HDWalletProvider = require('truffle-hdwallet-provider')
  const provider = new HDWalletProvider(process.env.MNEMONIC, 'https://rinkeby.infura.io/')
  web3 = new Web3(provider.engine)
} else {
  web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}
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

module.exports = (async () => {
  const promisedAcct = new Promise((a, r) => web3.eth.getAccounts((e, r) => a(r[0])))

  // Test VARS
  let eth
  let gno
  let rdn
  let dx
  let Token

  const tokenMap = {
    eth,
    gno,
    rdn,
    Token
  }

  const startingETH = 18e18
  const startingToken = 100e18

  const getContracts = async () => {
    const proxy = await Proxy.deployed()
    eth = await EtherToken.deployed()
    omg = await TokenOMG.deployed()
    rdn = await TokenRDN.deployed()
    dx = DutchExchange.at(proxy.address)
    Token = argv.token && tokenMap[argv.token] ? tokenMap[argv.token] : rdn

    return {
      EtherToken: eth,
      TokenOMG: omg,
      TokenRDN: rdn,
      DutchExchange: dx,
    }
  }
  const setup = async (a, tta) => {
    await eth.deposit({ from: a, value: startingETH })
    await eth.approve(dx.address, startingETH, { from: a })
    await tta.approve(dx.address, startingToken+20, { from: a })
    await dx.deposit(tta.address, startingToken, { from: a, gas: 234254})
    await dx.deposit(eth.address, startingETH, { from: a, gas: 234254})
  }

  try {
    const acct = await promisedAcct
    await getContracts()
    await setup(acct, Token)

    const receipt = await dx.addTokenPair(eth.address, Token.address, startingETH, 0, 1, 50, { from: acct, gas: 2374235})
    console.log(`
    ===========================
    Successfully added ${await Token.name.call()}
    Auction Index => ${(await dx.getAuctionIndex.call(eth.address, Token.address)).toNumber()}
    ===========================
    `)
  } catch (error) {
    throw new Error(error)
  }
})()