function migrate ({
  artifacts,
  deployer,
  network,
  accounts
}) {
  const TokenFRT = artifacts.require('TokenFRT')
  const TokenFRTProxy = artifacts.require('TokenFRTProxy')

  const { Math } = _getDependencies(artifacts, network, deployer)

  return deployer
    .then(() => Math.deployed())
    .then(() => deployer.link(Math, [TokenFRT, TokenFRTProxy]))
    .then(() => deployer.deploy(TokenFRT))
    // proxiedAddr, ownerAddr
    .then(() => {
      console.log('Deploying TokenFRTProxy with ACCOUNT ==> ', accounts[0])
      return deployer.deploy(TokenFRTProxy, TokenFRT.address, accounts[0])
    })
}

function _getDependencies (artifacts, network, deployer) {
  let Math
  if (network === 'development') {
    Math = artifacts.require('GnosisMath')
  } else {
    const contract = require('truffle-contract')
    Math = contract(require('@gnosis.pm/util-contracts/build/contracts/GnosisMath'))
    Math.setProvider(deployer.provider)
  }

  return {
    Math
  }
}

module.exports = migrate
