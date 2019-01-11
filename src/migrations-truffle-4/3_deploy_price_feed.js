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

  const medianizerAddress = getMedianizerAddress(Medianizer)
  const account = accounts[0]
  if (!medianizerAddress && network !== 'mainnet') {
    // Deploy Mock Medianizer for testing
    const MedianizerMock = artifacts.require('MedianizerMock')
    console.log(`Deploying MedianizerMock in "${network}"`)
    return deployer
      .deploy(MedianizerMock)
      .then(() => deployer.deploy(PriceOracleInterface, account, MedianizerMock.address))
      .then(medianizer => medianizer.setPrice(ethUsdPrice * 1e18, { from: account }))
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

module.exports = migrate
