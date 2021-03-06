/* global artifacts, web3 */
/* eslint no-undef: "error" */

const INITIAL_FUNDING = 10e6 // 10M
const { toWei } = require('./util/migrationUtils')({
  web3
})

module.exports = function (deployer) {
  function _deploy (token) {
    console.log('Deploy %s with initial funding of: %s', token, INITIAL_FUNDING)

    return deployer
      .deploy(artifacts.require(`Token${token}`), toWei(INITIAL_FUNDING))
  }

  deployer
    .then(() => _deploy('DAI'))
    .then(() => _deploy('GEN'))
    .then(() => _deploy('KNC'))
    .then(() => _deploy('MKR'))
}
