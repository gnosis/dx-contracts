/* global artifacts, web3 */
/* eslint no-undef: "error" */

const deployMath = require('@gnosis.pm/util-contracts/src/migrations/2_deploy_math')
const deployGno = require('@gnosis.pm/gno-token/src/migrations/3_deploy_GNO')
const deployOwl = require('@gnosis.pm/owl-token/src/migrations/3_deploy_OWL.js')
const deployAirdrop = require('@gnosis.pm/owl-token/src/migrations/4_deploy_OWL_airdrop.js')
const setupMinter = require('@gnosis.pm/owl-token/src/migrations/5_set_airdrop_as_OWL_minter')


module.exports = (deployer, network, accounts) => {
  if (network === 'development') {
    const deployParams = {
      artifacts,
      deployer,
      network,
      accounts,
      web3,
      initialTokenAmount: process.env.DEV_GNO_TOKEN_AMOUNT,
      gnoLockPeriodInHours: process.env.DEV_GNO_LOCK_PERIOD_IN_HOURS
    }
    deployer
      .then(() => deployMath(deployParams))
      .then(() => deployGno(deployParams))
      .then(() => deployOwl(deployParams))
      .then(() => deployAirdrop(deployParams))
      .then(() => setupMinter(deployParams))
  } else {
    throw new Error('Migrations are just for development. Current network is %s', network)
  }
}
