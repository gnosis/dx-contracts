// TODO: Provide a index.js that migrate all in utils, GNO and OWL
const deployUtils = require('@gnosis.pm/util-contracts/src/migrations')
const deployGno = require('@gnosis.pm/gno-token/src/migrations')
const deployOwl = require('@gnosis.pm/owl-token/src/migrations')

async function migrate ({
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

    await deployUtils(deployParams)
    await deployGno(deployParams)
    await deployOwl(deployParams)
  } else {
    console.log('Not in development, so nothing to do. Current network is %s', network)
  }
}

module.exports = migrate
