/* global artifacts */
/* eslint no-undef: "error" */

const contract = require('truffle-contract')

const THRESHOLD_NEW_TOKEN_PAIR_USD = 10000 // 10K USD
const THRESHOLD_AUCTION_START_USD = 1000   // 1K USD

const DutchExchange = artifacts.require('DutchExchange')
const TokenFRT = artifacts.require('TokenFRT')
const PriceOracleInterface = artifacts.require('PriceOracleInterface')

// Depnencidy contracts
const Proxy = contract(require('@gnosis.pm/util-contracts/build/contracts/Proxy'))
const EtherToken = contract(require('@gnosis.pm/util-contracts/build/contracts/EtherToken'))
const TokenGNO = contract(require('@gnosis.pm/gno-token/build/contracts/TokenGNO'))
const TokenOWLProxy = contract(require('@gnosis.pm/owl-token/build/contracts/TokenOWLProxy'))

module.exports = function (deployer, network, accounts) {  
  Proxy.setProvider(deployer.provider)
  EtherToken.setProvider(deployer.provider)
  TokenGNO.setProvider(deployer.provider)
  TokenOWLProxy.setProvider(deployer.provider)

  return deployer
    // Ensure the folowing contracts are deployed:
    //  Tokens: GNO, OWL, WETH
    //  PriceOracleInterface
    //  DX contract and its proxy
    .then(() => Promise.all([
      TokenFRT.deployed(),
      EtherToken.deployed(),
      TokenGNO.deployed(),
      TokenOWLProxy.deployed(),
      PriceOracleInterface.deployed(),
      DutchExchange.deployed(),
      Proxy.deployed(),
    ]))
    .then(() => {
      const dx = DutchExchange.at(Proxy.address)
      const owner = accounts[0]
      const frtAddress = TokenFRT.address
      const owlAddress = TokenOWLProxy.address
      const wethAddress = EtherToken.address
      const oracleAddress = PriceOracleInterface

      console.log('Setup DX with:')
      console.log('\t Owner: %s', owner)
      console.log('\t OWL address: %s', owlAddress)
      console.log('\t WETH address: %s', wethAddress)
      console.log('\t Price Oracle address: %s', oracleAddress)
      console.log('\t Threshold for new token pair: %s', THRESHOLD_NEW_TOKEN_PAIR_USD)
      console.log('\t Threshold for auction to start: %s', THRESHOLD_AUCTION_START_USD)
      
      console.log('\t Owner:')

      dx.setupDutchExchange(
        frtAddress,
        owlAddress,
        owner,
        wethAddress,
        oracleAddress,
        THRESHOLD_NEW_TOKEN_PAIR_USD * 1e18,
        THRESHOLD_AUCTION_START_USD * 1e18
      )
    })
}