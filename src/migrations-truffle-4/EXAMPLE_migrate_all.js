/* global artifacts, web3 */
/* eslint no-undef: "error" */

// Note: Use "migrations-truffle-5" for truffle 5

const deployUtils = require('@gnosis.pm/util-contracts/src/migrations-truffle-4')
const deployGno = require('@gnosis.pm/gno-token/src/migrations-truffle-4')
const deployOwl = require('@gnosis.pm/owl-token/src/migrations-truffle-4')
const migrationsDx = require('@gnosis.pm/dx-contracts/src/migrations-truffle-4')

module.exports = (deployer, network, accounts) => {
  if (network === 'development') {
    const deployParams = {
      artifacts,
      deployer,
      network,
      accounts,
      web3,
      initialTokenAmount: process.env.GNO_TOKEN_AMOUNT,
      gnoLockPeriodInHours: process.env.GNO_LOCK_PERIOD_IN_HOURS,
      thresholdNewTokenPairUsd: process.env.GNO_LOCK_PERIOD_IN_HOURS,
      thresholdAuctionStartUsd: process.env.GNO_LOCK_PERIOD_IN_HOURS
    }

    deployer
      .then(() => deployUtils(deployParams))
      .then(() => deployGno(deployParams))
      .then(() => deployOwl(deployParams))
      .then(() => migrationsDx(deployParams))
  } else {
    throw new Error('Migrations are just for development. Current network is %s', network)
  }
}
