/* global artifacts, web3 */
/* eslint no-undef: "error" */

const deployUtils = require('@gnosis.pm/util-contracts/src/migrations-truffle-4')
const deployGno = require('@gnosis.pm/gno-token/src/migrations-truffle-4')
const deployOwl = require('@gnosis.pm/owl-token/src/migrations-truffle-4')

const migrationsDx = require('@gnosis.pm/dx-contracts/src/migrations-truffle-4')

module.exports = async (deployer, network, accounts) => {
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

    await deployUtils(deployParams)
    await deployGno(deployParams)
    await deployOwl(deployParams)
    await migrationsDx(deployParams)
  } else {
    throw new Error('Migrations are just for development. Current network is %s', network)
  }
}
