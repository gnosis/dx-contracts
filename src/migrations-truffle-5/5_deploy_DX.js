async function migrate ({
  artifacts,
  deployer
}) {
  const DutchExchange = artifacts.require('DutchExchange')
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')

  console.log('Deploy DutchExchange contract')
  await deployer.deploy(DutchExchange)

  console.log('Deploy DutchExchangeProxy contract')
  await deployer.deploy(DutchExchangeProxy, DutchExchange.address)
}

module.exports = migrate
