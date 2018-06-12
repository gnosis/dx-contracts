/* global artifacts */
/* eslint no-undef: "error" */
/* global artifacts */
/* eslint no-undef: "error" */

const deployDx = require('../src/migrations/6_setup_DX')

module.exports = function (deployer, network, accounts) {
  return deployDx({
    artifacts,
    deployer,
    network,
    accounts,
    thresholdNewTokenPairUsd: process.env.THRESHOLD_NEW_TOKEN_PAIR_USD,
    thresholdAuctionStartUsd: process.env.THRESHOLD_AUCTION_START_USD
  })
}
