/* global artifacts, web3 */
/* eslint no-undef: "error" */
const deployPriceFeed = require('../src/migrations/3_deploy_price_feed')

module.exports = function (deployer, network, accounts) {
  return deployPriceFeed({
    artifacts,
    deployer,
    network,
    accounts,
    web3,
    ethUsdPrice: process.env.ETH_USD_PRICE,
    feedExpirePeriodDays: process.env.FEED_EXPIRE_PERIOD_DAYS
  })
}
