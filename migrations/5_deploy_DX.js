/* global artifacts, web3 */
/* eslint no-undef: "error" */

const deployDx = require('../src/migrations-truffle-4/5_deploy_DX')

module.exports = function (deployer, network, accounts) {
  return deployDx({
    artifacts,
    deployer,
    network,
    accounts,
    web3
  })
}
