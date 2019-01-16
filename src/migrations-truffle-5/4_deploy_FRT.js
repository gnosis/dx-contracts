async function migrate ({
  artifacts,
  deployer,
  network,
  accounts
}) {
  const account = accounts[0]
  const TokenFRT = artifacts.require('TokenFRT')
  const TokenFRTProxy = artifacts.require('TokenFRTProxy')
  const { Math } = _getDependencies(artifacts, network, deployer)
  await Math.deployed()

  console.log('Link math lib to TokenFrt')
  await deployer.link(Math, [TokenFRT, TokenFRTProxy])

  console.log('Deploying TokenFRT with owner: %s', account)
  await deployer.deploy(TokenFRT, account)
  await deployer.deploy(TokenFRTProxy, TokenFRT.address, account)
}

function _getDependencies (artifacts, network, deployer) {
  let Math
  if (network === 'development') {
    Math = artifacts.require('Math')
  } else {
    const contract = require('truffle-contract')
    Math = contract(require('@gnosis.pm/util-contracts/build/contracts/Math'))
    Math.setProvider(deployer.provider)
  }

  return {
    Math
  }
}

module.exports = migrate
