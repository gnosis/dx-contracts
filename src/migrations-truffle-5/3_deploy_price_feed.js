const DEFAULT_ETH_USD_PRICE = process.env.ETH_USD_PRICE || 1100 // 500 USD/ETH
const DEFAULT_FEED_EXPIRE_PERIOD_DAYS =
  process.env.FEED_EXPIRE_PERIOD_DAYS || 365 // 1 year

async function migrate ({
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
    const medianizer = await deployer.deploy(MedianizerMock)

    // Deploy price oracle interface
    console.log('Deploy PriceOracleInterface:')
    console.log('  - account: %s', account)
    console.log('  - medianizer address: %s', medianizer.address)
    await deployer.deploy(PriceOracleInterface, account, medianizer.address)

    // Set price
    const BN = web3.utils.BN
    const ethUsdPriceWei = web3.utils.toWei(new BN(ethUsdPrice))
    console.log('Set price for medianizer:')
    console.log('  - price: %s', ethUsdPriceWei)
    await medianizer.setPrice(ethUsdPriceWei)
  } else {
    console.log(
      `No need to deploy the Medianizer. Using ${medianizerAddress} as the Medianizer address`
    )

    console.log('Deploy PriceOracleInterface:')
    console.log('  - account: %s', account)
    console.log('  - medianizer address: %s', medianizerAddress)
    await deployer.deploy(PriceOracleInterface, account, medianizerAddress)
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
