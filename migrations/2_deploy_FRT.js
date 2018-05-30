/* global artifacts */
/* eslint no-undef: "error" */
const contract = require('truffle-contract')

// const Math = artifacts.require('Math')
const TokenFRT = artifacts.require('TokenFRT')
const Math = contract(require('@gnosis.pm/util-contracts/build/contracts/Math'))

module.exports = function (deployer, network, accounts) {  
  Math.setProvider(deployer.provider)

  const account = accounts[0]

  return Math
    .deployed()
    .then(math => {
      return deployer.link(Math, accounts)
    })
    .then(() => {
      console.log('Deploying TokenFRT with owner: %s', account)
      return deployer.deploy(accounts, account)
    })
}
