const migrateDependencies = require('./2_migrate_dependencies')
const deployPriceFeed = require('./3_deploy_price_feed')
const deployFRT = require('./4_deploy_FRT')
const deployDX = require('./5_deploy_DX')
const setupDx = require('./6_setup_DX')
const setDxAsFrtMintern = require('./7_set_DX_as_FRT_minter')

module.exports = async params => {
  await migrateDependencies(params)
  await deployPriceFeed(params)
  await deployFRT(params)
  await deployDX(params)
  await setupDx(params)
  await setDxAsFrtMintern(params)
}
