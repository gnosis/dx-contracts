/* global artifacts */
/* eslint no-undef: "error" */
const setDxAsFrtOwner = require('../src/migrations/7_set_DX_as_FRT_minter')

module.exports = function (deployer, network, accounts) {
  return setDxAsFrtOwner({
    artifacts,
    deployer,
    network,
    accounts
  })
}
// Last step of the migration:

// At some later point we would change the ownerShip of the MagnoliaTokens in order to make funds secure. See audit report
// .then(() => TokenFRT.deployed())
// .then(T => T.updateOwner(Proxy.address))
