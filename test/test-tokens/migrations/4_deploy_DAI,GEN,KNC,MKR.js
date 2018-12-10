/* global deployer */
/* eslint no-undef: "error" */

const INITIAL_FUNDING = 10e6 // 10M
module.exports = function(deployer) {

  function _deploy(token) {
    return deployer
      .deploy(artifacts.require(`Token${token}`), INITIAL_FUNDING * 1e18)
  }

  deployer
    .then(() => _deploy('DAI'))
    .then(() => _deploy('GEN'))
    .then(() => _deploy('KNC'))
    .then(() => _deploy('MKR'))
};


