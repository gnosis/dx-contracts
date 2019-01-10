/* global artifacts, web3 */
/* eslint no-undef: "error" */
const setupDx = require('../src/migrations-truffle-5/6_setup_DX')

module.exports = function (deployer, network, accounts) {
  return setupDx({
    artifacts,
    deployer,
    network,
    accounts,
    web3,
    thresholdNewTokenPairUsd: process.env.THRESHOLD_NEW_TOKEN_PAIR_USD,
    thresholdAuctionStartUsd: process.env.THRESHOLD_AUCTION_START_USD
  })
}
