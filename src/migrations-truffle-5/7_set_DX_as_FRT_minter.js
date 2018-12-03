async function migrate ({
  artifacts
}) {
  const TokenFRT = artifacts.require('TokenFRT')
  const DutchExchangeProxy = artifacts.require('DutchExchangeProxy')

  // Make sure TokenFRT and the proxy are deployed
  const tokenFrt = await TokenFRT.deployed()
  const dxProxy = await DutchExchangeProxy.deployed()

  console.log('Update minter in TokenFRT:')
  console.log('  - Set dutchX address: %s', dxProxy.address)
  await tokenFrt.updateMinter(dxProxy.address)
}

module.exports = migrate
