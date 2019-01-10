/* global artifacts, web3 */
/* eslint no-undef: "error" */

const deployFrt = require('../src/migrations-truffle-5/4_deploy_FRT')

module.exports = function (deployer, network, accounts) {
  return deployFrt({
    artifacts,
    deployer,
    network,
    accounts,
    web3
  })
}
