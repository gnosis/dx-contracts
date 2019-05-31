/* global artifacts, web3 */
/* eslint no-undef: "error" */

const { toWei } = require('./util/migrationUtils')({
  web3
})

const INITIAL_FUNDING = 10e6 // 10M
module.exports = function (deployer) {
  function _deploy (token, decimals) {
    console.log('Deploy %s with initial funding of: %s', token, INITIAL_FUNDING)

    return deployer
      .deploy(artifacts.require(`Token${token}`), toWei(INITIAL_FUNDING, decimals))
  }

  deployer
    .then(() => _deploy('GRID', 12))
    .then(() => _deploy('CVC', 8))
}
