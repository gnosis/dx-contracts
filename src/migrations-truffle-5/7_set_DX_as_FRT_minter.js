async function migrate ({
  artifacts
}) {
  const TokenFRT = artifacts.require('TokenFRT')
  const TokenFRTProxy = artifacts.require('TokenFRTProxy')
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')

  // Make sure TokenFRT and the proxy are deployed
  const dxProxy = await DutchExchangeProxy.deployed()
  const frtProxy = await TokenFRTProxy.deployed()
  const tokenFrt = await TokenFRT.at(frtProxy.address)

  console.log('Update minter in TokenFRT:')
  console.log('  - Set dutchX address: %s', dxProxy.address)
  await tokenFrt.updateMinter(dxProxy.address)
}

module.exports = migrate
