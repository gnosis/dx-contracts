/* global artifacts */
/* eslint no-undef: "error" */

const migrations = require('./migrations')

module.exports = function (deployer, network, accounts) {
  return migrations({
    artifacts,
    deployer,
    network,
    accounts,
    web3,
    thresholdNewTokenPairUsd,
    thresholdAuctionStartUsd
  })
}
