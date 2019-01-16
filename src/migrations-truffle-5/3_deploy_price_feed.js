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
  const PriceFeed = artifacts.require('PriceFeed')

  const medianizerAddress = getMedianizerAddress(Medianizer)
  const account = accounts[0]
  if (!medianizerAddress) {
    console.log(
      `Deploying Maker Dao feed contracts, because they weren published in network "${network}" yet`
    )
    // Deployment of PriceFeedInfrastructure

    console.log('Deploy PriceFeed')
    await deployer.deploy(PriceFeed)
    const priceFeed = await PriceFeed.deployed()

    console.log('Deploy Medianizer')
    await deployer.deploy(Medianizer)
    const medianizer = await Medianizer.deployed()

    console.log('Deploy PriceOracleInterface:')
    console.log('  - account: %s', account)
    console.log('  - medianizer address: %s', medianizer.address)
    await deployer.deploy(PriceOracleInterface, account, medianizer.address)

    console.log('Set price feed for medianizer:')
    console.log('  - price feed address: %s', PriceFeed.address)
    await medianizer.set(PriceFeed.address)

    const now = await getTime(web3)
    const expireTime = now + feedExpirePeriodDays * 24 * 60 * 60

    console.log('Post price for price feed:')
    console.log('  - ETH-USD: %s', ethUsdPrice)
    console.log('  - Expire time: %s', new Date(expireTime * 1000))
    console.log('  - Medianizer address: %s', medianizer.address)

    const BN = web3.utils.BN
    const ethUsdPriceWei = web3.utils.toWei(new BN(ethUsdPrice))
    await priceFeed.post(ethUsdPriceWei, expireTime, medianizer.address)
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

async function getTime (web3) {
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
