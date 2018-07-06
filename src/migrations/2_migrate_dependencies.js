// TODO: Provide a index.js that migrate all in utils, GNO and OWL
const deployMath = require('@gnosis.pm/util-contracts/src/migrations/2_deploy_math')
const deployWeth = require('@gnosis.pm/util-contracts/src/migrations/3_deploy_WETH')
const deployGno = require('@gnosis.pm/gno-token/src/migrations/3_deploy_GNO')
const deployOwl = require('@gnosis.pm/owl-token/src/migrations/3_deploy_OWL.js')
const deployAirdrop = require('@gnosis.pm/owl-token/src/migrations/4_deploy_OWL_airdrop.js')
const setupMinter = require('@gnosis.pm/owl-token/src/migrations/5_set_airdrop_as_OWL_minter')

function migrate ({
  artifacts,
  deployer,
  network,
  accounts,
  initialTokenAmount,
  gnoLockPeriodInHours
}) {
  if (network === 'development') {
    const deployParams = {
      artifacts,
      deployer,
      network,
      accounts,
      initialTokenAmount,
      gnoLockPeriodInHours
    }
    deployer
      .then(() => deployMath(deployParams))
      .then(() => deployWeth(deployParams))
      .then(() => deployGno(deployParams))
      .then(() => deployOwl(deployParams))
      .then(() => deployAirdrop(deployParams))
      .then(() => setupMinter(deployParams))
  } else {
    console.log('Not in development, so nothing to do. Current network is %s', network)
  }
}

module.exports = migrate
