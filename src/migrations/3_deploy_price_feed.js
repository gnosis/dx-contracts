const DEFAULT_ETH_USD_PRICE = process.env.ETH_USD_PRICE || 1100 // 500 USD/ETH
const DEFAULT_FEED_EXPIRE_PERIOD_DAYS = process.env.FEED_EXPIRE_PERIOD_DAYS || 365 // 1 year

function migrate ({
  artifacts,
  deployer,
  network,
  accounts,
  web3,
  ethUsdPrice = DEFAULT_ETH_USD_PRICE,
  feedExpirePeriodDays = DEFAULT_FEED_EXPIRE_PERIOD_DAYS
}) {
  const Medianizer = artifacts.require('Medianizer')
  const PriceOracleInterface = artifacts.require('PriceOracleInterface')
  const PriceFeed = artifacts.require('PriceFeed')

  const medianizerAddress = getMedianizerAddress(Medianizer)
  const account = accounts[0]
  if (!medianizerAddress) {
    console.log(`Deploying Maker Dao feed contracts, because they weren published in network "${network}" yet`)
    // Deployment of PriceFeedInfrastructure
    return deployer
      .deploy([ PriceFeed, Medianizer ])
      .then(() => deployer.deploy(PriceOracleInterface, account, Medianizer.address))
      .then(() => Medianizer.deployed())
      .then(medianizer => medianizer.set(PriceFeed.address, { from: account }))
      .then(() => Promise.all([
        PriceFeed.deployed(),
        getTime(web3)
      ]))
      .then(([ priceFeed, now ]) => priceFeed.post(
        ethUsdPrice * 1e18,
        now + feedExpirePeriodDays * 24 * 60 * 60,
        Medianizer.address, {
          from: account
        })
      )
  } else {
    console.log(`No need to deploy the Medianizer. Using ${medianizerAddress} as the Medianizer address`)
    console.log('Deploying PriceOracleInterface with owner: %s', account)
    return deployer
      .deploy(PriceOracleInterface, account, Medianizer.address)
  }
}

function getMedianizerAddress (Medianizer) {
  try {
    return Medianizer.address
  } catch (error) {
    // Medianizer.address throw an error if there's no config address
    // As a result, only development should be deploying this contracts
    return null
  }
}

function getTime (web3) {
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

module.exports = migrate
