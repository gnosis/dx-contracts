/* global artifacts */
/* eslint no-undef: "error" */
const setDxAsFrtOwner = require('../src/migrations/7_set_DX_as_FRT_owner')

module.exports = function (deployer, network, accounts) {
  return setDxAsFrtOwner({
    artifacts,
    deployer,
    network,
    accounts
  })
}
