/* global artifacts */
/* eslint no-undef: "error" */
const migrateDependencies = require('../src/migrations/2_migrate_dependencies')

module.exports = function (deployer, network, accounts) {
  return migrateDependencies({
    artifacts,
    deployer,
    network,
    accounts,
    ethUsdPrice: process.env.ETH_USD_PRICE,
    feedExpirePeriodDays: process.env.FEED_EXPIRE_PERIOD_DAYS
  })
}
