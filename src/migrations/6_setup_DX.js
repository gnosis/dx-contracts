const DEFAULT_THRESHOLD_NEW_TOKEN_PAIR_USD = 10000 // 10K USD
const DEFAULT_THRESHOLD_AUCTION_START_USD = 1000 // 1K USD

function migrate ({
  artifacts,
  deployer,
  network,
  accounts,
  thresholdNewTokenPairUsd = DEFAULT_THRESHOLD_NEW_TOKEN_PAIR_USD,
  thresholdAuctionStartUsd = DEFAULT_THRESHOLD_AUCTION_START_USD
}) {
  const TokenFRT = artifacts.require('TokenFRT')
  const DutchExchange = artifacts.require('DutchExchange')
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')
  const PriceOracleInterface = artifacts.require('PriceOracleInterface')
  const {
    EtherToken,
    TokenGNO,
    TokenOWLProxy
  } = _getDependencies(artifacts, network, deployer)

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
      DutchExchangeProxy.deployed()
    ]))
    .then(() => {
      const dx = DutchExchange.at(DutchExchangeProxy.address)
      const owner = accounts[0]
      const frtAddress = TokenFRT.address
      const owlAddress = TokenOWLProxy.address
      const wethAddress = EtherToken.address
      const oracleAddress = PriceOracleInterface.address

      console.log('Setup DX with:')
      console.log('\t Owner: %s', owner)
      console.log('\t OWL address: %s', owlAddress)
      console.log('\t FRT address: %s', frtAddress)
      console.log('\t WETH address: %s', wethAddress)
      console.log('\t Price Oracle address: %s', oracleAddress)
      console.log('\t Threshold for new token pair: %s', thresholdNewTokenPairUsd)
      console.log('\t Threshold for auction to start: %s', thresholdAuctionStartUsd)

      return dx.setupDutchExchange(
        frtAddress,
        owlAddress,
        owner,
        wethAddress,
        oracleAddress,
        thresholdNewTokenPairUsd * 1e18,
        thresholdAuctionStartUsd * 1e18
      )
    })
}

function _getDependencies (artifacts, network, deployer) {
  let EtherToken, TokenGNO, TokenOWLProxy
  if (network === 'development') {
    EtherToken = artifacts.require('EtherToken')
    TokenGNO = artifacts.require('TokenGNO')
    TokenOWLProxy = artifacts.require('TokenOWLProxy')
  } else {
    const contract = require('truffle-contract')
    EtherToken = contract(require('@gnosis.pm/util-contracts/build/contracts/EtherToken'))
    EtherToken.setProvider(deployer.provider)
    TokenGNO = contract(require('@gnosis.pm/gno-token/build/contracts/TokenGNO'))
    TokenGNO.setProvider(deployer.provider)
    TokenOWLProxy = contract(require('@gnosis.pm/owl-token/build/contracts/TokenOWLProxy'))
    TokenOWLProxy.setProvider(deployer.provider)
  }

  return { EtherToken, TokenGNO, TokenOWLProxy }
}

module.exports = migrate
