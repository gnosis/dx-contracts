/* global artifacts */
/* eslint no-undef: "error" */

const deployDx = require('../src/migrations/5_deploy_DX')

module.exports = function (deployer, network, accounts) {
  return deployDx({
    artifacts,
    deployer,
    network,
    accounts
  })
}
