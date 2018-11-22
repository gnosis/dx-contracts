const deployUtils = require('@gnosis.pm/util-contracts/src/migrations')
const deployGno = require('@gnosis.pm/gno-token/src/migrations')
const deployOwl = require('@gnosis.pm/owl-token/src/migrations')

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
      .then(() => deployUtils(deployParams))
      .then(() => deployGno(deployParams))
      .then(() => deployOwl(deployParams))
  } else {
    console.log('Not in development, so nothing to do. Current network is %s', network)
  }
}

module.exports = migrate
