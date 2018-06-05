/* global artifacts */
/* eslint no-undef: "error" */
const contract = require('truffle-contract')

const ETH_USD_PRICE = process.env.ETH_USD_PRICE || 500 // 500 USD/ETH 
const FEED_EXPIRE_PERIOD_DAYS = process.env.FEED_EXPIRE_PERIOD_DAYS || 365 // 1 year

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

function getTime () {
  return new Promise((resolve, reject) => {
    web3.eth.getBlock('latest', (err, block) => {
      if (err) {
        return reject(err)
      } else {
        resolve(block.timestamp)
      }
    })
  })
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
      .then(() => Promise.all([
        PriceFeed.deployed(),
        getTime()
      ])
      .then(([ priceFeed, time ]) => priceFeed.post(
        ETH_USD_PRICE * 1e18,
        now + FEED_EXPIRE_PERIOD_DAYS * 24 * 60 * 60,
        Medianizer.address, {
          from: account
        })
      )
  } else {    
    console.log(`No need to deploy theMaker Dao feed contracts. Using ${medianizerAddress} as the Medianizer address`)
  }
}
