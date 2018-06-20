const deployPriceFeed = require('./3_DEV-deploy_price_feed')
const deployFRT = require('./4_deploy_FRT')
const deployDX = require('./5_deploy_DX')
const setupDx = require('./6_setup_DX')
const setDxAsFrtMintern = require('./7_set_DX_as_FRT_minter')

module.exports = (params) => Promise.all([
  deployPriceFeed(params),
  deployFRT(params),
  deployDX(params),
  setupDx(params),
  setDxAsFrtMintern(params),
])