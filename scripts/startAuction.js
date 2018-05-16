/**
 * node scritps/startAuction.js
 * to add a new TradingPair ETH:Token to the DutchExchange
 * @flags:
 * --network                    if not specified, testrpc will be used. Otherwise rinkeby             
 * --tokenToAddAddress          any token that inherits the StandartToken functions can be submitted    
 * --priceNum                   price is given in units [tokenToAdd]/[EtherToken] = [buyToken]/[sellToken]
 * --priceDen
 * --fundingETH                 how much Ether should be sold in the first auction
 * --fundingToken               how much Tokens should be deposited on the exchange    
 */

const Web3 = require('web3')
const fs = require('fs')
const argv = require('minimist')(process.argv.slice(2), { string: 'a', string: 'tokenToAddAddress' })

//optional for MNEMONICs
//const mnemonic = process.env.MNEMONIC // Mnemonic for account
//const HDWalletProvider = require('truffle-hdwallet-provider')
//const provider = new HDWalletProvider(process.env.MNEMONIC, 'https://rinkeby.infura.io/')


const privKey = process.env.PrivateKEY // raw private key
const HDWalletProvider = require("truffle-hdwallet-provider-privkey");

let web3
if (argv.network) {
  if(argv.network == 'rinkeby')
    provider = new HDWalletProvider(privKey, 'https://rinkeby.infura.io/')
  else if(argv.network == 'kovan'){
    provider = new HDWalletProvider(privKey, 'https://kovan.infura.io/')
  }
  else if(argv.network == 'mainnet'){
    provider = new HDWalletProvider(privKey, 'https://mainet.infura.io/')
  }
  web3 = new Web3(provider.engine)
} else {
  web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}

const TruffleContract = require('truffle-contract')

// retrieve truffle-contracts 
const EtherTokenJson = JSON.parse(fs.readFileSync('./build/contracts/EtherToken.json'))
const EtherToken = TruffleContract(EtherTokenJson)
const TokenRDNJson = JSON.parse(fs.readFileSync('./build/contracts/TokenRDN.json'))
const TokenRDN = TruffleContract(TokenRDNJson)
const StandardTokenJson = JSON.parse(fs.readFileSync('./build/contracts/StandardToken.json'))
const StandardToken = TruffleContract(StandardTokenJson)
const ProxyJson = JSON.parse(fs.readFileSync('./build/contracts/Proxy.json'))
const Proxy = TruffleContract(ProxyJson)
const DutchExchangeJson = JSON.parse(fs.readFileSync('./build/contracts/DutchExchange.json'))
const DutchExchange = TruffleContract(DutchExchangeJson)
const PriceOracleInterfaceJson = JSON.parse(fs.readFileSync('./build/contracts/PriceOracleInterface.json'))
const PriceOracleInterface = TruffleContract(PriceOracleInterfaceJson)

//linking provider
EtherToken.setProvider(web3.currentProvider)
DutchExchange.setProvider(web3.currentProvider)
Proxy.setProvider(web3.currentProvider)
TokenRDN.setProvider(web3.currentProvider)
StandardToken.setProvider(web3.currentProvider)
PriceOracleInterface.setProvider(web3.currentProvider)

module.exports = (async () => {
  const promisedAcct = new Promise((a, r) => web3.eth.getAccounts((e, r) => a(r[0])))

  // Test VARS
  let eth
  let rdn
  let dx
  let Token

  const sellVolumeInETH = argv.fundingETH ? argv.fundingETH : 18e18
  const startingToken = argv.fundingToken ? argv.fundingToken : 0

  const getContracts = async () => {
    const proxy = await Proxy.deployed()
    eth = await EtherToken.deployed()
    rdn = await TokenRDN.deployed()
    dx = DutchExchange.at(proxy.address)
    if(argv.tokenToAddAddress){
      Token = StandardToken.at(argv.tokenToAddAddress)
    } else{
      Token = rdn
    }
    return {
      EtherToken: eth,
      TokenRDN: rdn,
      DutchExchange: dx,
    }
  }
  const setup = async (a, tta) => {

    //if( (await web3.eth.getBalance(a)).toNumber()< sellVolumeInETH)
    //  throw("Not enough Eth funds availbale")

    await eth.deposit({ from: a, value: sellVolumeInETH })
    await eth.approve(dx.address, sellVolumeInETH, { from: a })
    await tta.approve(dx.address, startingToken, { from: a })
    //if( (await tta.balanceOf(a)).toNumber()< startingToken)
    //  throw("Not enough funds of the buyTokens are availbale")

    await dx.deposit(tta.address, startingToken, { from: a, gas: 234254})
    await dx.deposit(eth.address, sellVolumeInETH, { from: a, gas: 334254})
  }
  const checkETHFundingSufficient = async () => {
    const oracle = await PriceOracleInterface.deployed()
    const price = (await oracle.getUSDETHPrice.call()).toNumber()
    if(price*sellVolumeInETH/1e18 < 10)
      throw("ETHFunding not sufficient")
    return;
  }

  try {
    const acct = await promisedAcct
    await getContracts()
    await checkETHFundingSufficient()
    await setup(acct, Token)
    const receipt = await dx.addTokenPair(eth.address, Token.address, sellVolumeInETH, 0, argv.priceNum ? argv.priceNum : 1, argv.priceDen ? argv.priceDen : 1, { from: acct, gas: 2374235})
    console.log(`
    ===========================
    Successfully added  => [Ether Token // ${await Token.address}] Auction
    Auction Index       => ${(await dx.getAuctionIndex.call(eth.address, Token.address)).toNumber()}
    price in [ETH/Token] =>${(await dx.closingPrices.call(eth.address, Token.address, 0))}
    Receipt.tx          => ${JSON.stringify(receipt.tx, false, 2)}
    ===========================
    `)
  } catch (error) {
    throw new Error(error)
  }
  process.exit(0)
})()