const DEFAULT_THRESHOLD_NEW_TOKEN_PAIR_USD = 10000 // 10K USD
const DEFAULT_THRESHOLD_AUCTION_START_USD = 1000 // 1K USD

async function migrate ({
  artifacts,
  deployer,
  network,
  accounts,
  web3,
  thresholdNewTokenPairUsd = DEFAULT_THRESHOLD_NEW_TOKEN_PAIR_USD,
  thresholdAuctionStartUsd = DEFAULT_THRESHOLD_AUCTION_START_USD
}) {  
  const owner = accounts[0]
  const TokenFRT = artifacts.require('TokenFRT')
  const TokenFRTProxy = artifacts.require('TokenFRTProxy')
  const DutchExchange = artifacts.require('DutchExchange')
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')
  const PriceOracleInterface = artifacts.require('PriceOracleInterface')
  const {
    EtherToken,
    TokenGNO,
    TokenOWLProxy
  } = _getDependencies(artifacts, network, deployer)

  // Ensure the folowing contracts are deployed:
  //   - Tokens: GNO, OWL, WETH, MGN
  //   - PriceOracleInterface
  //   - DX contract and its proxy
  await TokenGNO.deployed()
  const tokenOWLProxy = await TokenOWLProxy.deployed()
  const etherToken = await EtherToken.deployed()
  
  const tokenFRT = await TokenFRT.at(TokenFRTProxy.address)

  const priceOracleInterface = await PriceOracleInterface.deployed()
  const dxProxy = await DutchExchangeProxy.deployed()
  await DutchExchange.deployed()
  const dx = await DutchExchange.at(dxProxy.address)

  const frtAddress = tokenFRT.address
  const owlAddress = tokenOWLProxy.address
  const wethAddress = etherToken.address
  const oracleAddress = priceOracleInterface.address

  console.log('Setup DX with:')
  console.log('\t Owner: %s', owner)
  console.log('\t OWL address: %s', owlAddress)
  console.log('\t FRT address: %s', frtAddress)
  console.log('\t WETH address: %s', wethAddress)
  console.log('\t Price Oracle address: %s', oracleAddress)
  console.log('\t Threshold for new token pair: %s', thresholdNewTokenPairUsd)
  console.log('\t Threshold for auction to start: %s', thresholdAuctionStartUsd)

  const BN = web3.utils.BN
  await dx.setupDutchExchange(
    frtAddress,
    owlAddress,
    owner,
    wethAddress,
    oracleAddress,    
    web3.utils.toWei(
      new BN(thresholdNewTokenPairUsd)
    ),
    web3.utils.toWei(
      new BN(thresholdAuctionStartUsd)
    )
  )
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
