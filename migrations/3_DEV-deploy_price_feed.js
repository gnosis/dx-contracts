/* global artifacts */
/* eslint no-undef: "error" */
const contract = require('truffle-contract')

const ETH_USD_PRICE = 500
const MAGIC_NUMBER_TO_BE_RENAMED = 1516168838 * 2

const PriceFeed = artifacts.require('PriceFeed')
const Medianizer = artifacts.require('Medianizer')
const PriceOracleInterface = artifacts.require('PriceOracleInterface')

function getMedianizerAddress () {
  try {
    return Medianizer.address 
  } catch (error) {
    // Medianizer.address throw an error if there's no config address
    // As a result, only development should be deploying this contracts
    return null
  }  
}


module.exports = function (deployer, network, accounts) {
  const medianizerAddress = getMedianizerAddress()
  const account = accounts[0]
  if (!medianizerAddress) {
    console.log(`Deploying Maker Dao feed contracts, because they weren published in network "${network}" yet`)
    // Deployment of PriceFeedInfrastructure
    deployer.deploy([ PriceFeed, Medianizer ])
      .then(() => deployer.deploy(PriceOracleInterface, account, Medianizer.address))
      .then(() => Medianizer.deployed())
      .then(medianizer => medianizer.set(PriceFeed.address, { from: account }))
      .then(() => PriceFeed.deployed())
      .then(priceFeed => priceFeed.post(
        ETH_USD_PRICE * 1e18,
        MAGIC_NUMBER_TO_BE_RENAMED,
        Medianizer.address, {
          from: account
        })
      )
  } else {    
    console.log(`No need to deploy theMaker Dao feed contracts. Using ${medianizerAddress} as the Medianizer address`)
  }
}
