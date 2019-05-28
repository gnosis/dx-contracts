const deployUtils = require('@gnosis.pm/util-contracts/src/migrations-truffle-5')
const deployGno = require('@gnosis.pm/gno-token/src/migrations-truffle-5')
const deployOwl = require('@gnosis.pm/owl-token/src/migrations-truffle-5')

function migrate ({
  artifacts,
  deployer,
  network,
  accounts,
  initialTokenAmount,
  gnoLockPeriodInHours,
  web3
}) {
  if (network === 'development') {
    const deployParams = {
      artifacts,
      deployer,
      network,
      accounts,
      initialTokenAmount,
      gnoLockPeriodInHours,
      web3
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
