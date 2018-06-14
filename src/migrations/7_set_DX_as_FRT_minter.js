function migrate ({
  artifacts,
  deployer
}) {
  const TokenFRT = artifacts.require('TokenFRT')
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')

  return deployer
    .then(() => TokenFRT.deployed())
    .then(tokenFrt => tokenFrt.updateMinter(DutchExchangeProxy.address))
}

module.exports = migrate
