function migrate ({
  artifacts,
  deployer
}) {
  const TokenFRT = artifacts.require('TokenFRT')
  const TokenFRTProxy = artifacts.require('TokenFRTProxy')
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')

  return deployer
    .then(() => TokenFRT.at(TokenFRTProxy.address))
    .then(tokenFRT => tokenFRT.updateMinter(DutchExchangeProxy.address))
}

module.exports = migrate
