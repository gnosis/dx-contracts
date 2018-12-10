const migrateDependencies = require('./2_migrate_dependencies')
const deployPriceFeed = require('./3_deploy_price_feed')
const deployFRT = require('./4_deploy_FRT')
const deployDX = require('./5_deploy_DX')
const setupDx = require('./6_setup_DX')
const setDxAsFrtMintern = require('./7_set_DX_as_FRT_minter')

module.exports = params => {
  return params.deployer
    .then(() => migrateDependencies(params))
    .then(() => deployPriceFeed(params))
    .then(() => deployFRT(params))
    .then(() => deployDX(params))
    .then(() => setupDx(params))
    .then(() => setDxAsFrtMintern(params))
}
