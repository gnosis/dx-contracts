/* global artifacts */
/* eslint no-undef: "error" */

const deployFrt = require('../src/migrations/4_deploy_FRT')

module.exports = function (deployer, network, accounts) {
  return deployFrt({
    artifacts,
    deployer,
    network,
    accounts
  })
}
