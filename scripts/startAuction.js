const Web3 = require('web3')
const HDWalletProvider = require('truffle-hdwallet-provider')
const fs = require('fs')

const mnemonic = process.env.MNEMONIC
 
const provider = new HDWalletProvider(mnemonic , "https://kovan.infura.io/")
web3 = new Web3(provider.engine)
var TruffleContract = require("truffle-contract");

//contracts
var EtherTokenJson = JSON.parse(fs.readFileSync('./build/contracts/EtherToken.json'))
var EtherToken = TruffleContract(EtherTokenJson)
var TokenOMGJson = JSON.parse(fs.readFileSync('./build/contracts/TokenOMG.json'))
var TokenOMG = TruffleContract(TokenOMGJson)
var ProxyJson = JSON.parse(fs.readFileSync('./build/contracts/Proxy.json'))
var Proxy = TruffleContract(ProxyJson)
var DutchExchangeJson = JSON.parse(fs.readFileSync('./build/contracts/DutchExchange.json'))
var DutchExchange = TruffleContract(DutchExchangeJson)


EtherToken.setProvider(web3.currentProvider);
DutchExchange.setProvider(web3.currentProvider);
Proxy.setProvider(web3.currentProvider);
TokenOMG.setProvider(web3.currentProvider);
// Test VARS
let eth
let gno
let tul
let dx
let omg
let acct

const startingETH = 13e18
const startingOMG = 100e18 

const getContracts = async () => {
   eth = await EtherToken.deployed()
   omg = await TokenOMG.deployed()
   const proxy = await Proxy.deployed()
   dx = DutchExchange.at(proxy.address)  
   return {
    EtherToken: eth,
    TokenOMG: omg,
    DutchExchange: dx,
  }
}
const setup = async ()=>{
  await eth.deposit({ from: acct, value: startingETH })
  await eth.approve(dx.address, startingETH, { from: acct })
  await omg.approve(dx.address, startingOMG, { from: acct })
  await dx.deposit(eth.address, startingETH, { from: acct })
  await dx.deposit(omg.address, startingOMG, { from: acct })
}

const p=new Promise((resolve, reject) => {
      web3.eth.getAccounts((error, result) =>{
      resolve(result)
      })
    })

p.then((a)=>{
  acct = a[0]
  return getContracts()
})
.then((c)=> { 
            eth = c.EtherToken
            omg = c.TokenOMG
            dx = c.DutchExchange})
.then(() => { return setup()})
.then(() => {
  return dx.balances(eth.address, acct)})
.then((t)=> {console.log(t)
  return dx.getAuctionIndex(eth.address, omg.address)})
.then((t)=> {console.log(t)
  return dx.sellVolumesCurrent(eth.address, omg.address)})
.then((t)=> {console.log(t)
  console.log(dx.address)
  console.log(eth.address)
  console.log(omg.address)
  return dx.addTokenPair(eth.address, omg.address, startingETH, 0, 1, 50,{from: acct})})
