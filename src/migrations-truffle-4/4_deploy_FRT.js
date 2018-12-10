function migrate ({
  artifacts,
  deployer,
  network,
  accounts
}) {
  const TokenFRT = artifacts.require('TokenFRT')
  const { Math } = _getDependencies(artifacts, network, deployer)

  return deployer
    .then(() => Math.deployed())
    .then(math => deployer.link(Math, TokenFRT))
    .then(() => {
      const account = accounts[0]
      console.log('Deploying TokenFRT with owner: %s', account)
      return deployer.deploy(TokenFRT, account)
    })
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
