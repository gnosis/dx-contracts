/* global web3, artifacts */
/* eslint no-undef: "error" */

const TokenOMG = artifacts.require('TokenOMG')
const INITIAL_FUNDING = 10e6 // 00M

const { toWei } = require('./util/migrationUtils')({
  web3
})

module.exports = function (deployer) {
  console.log('Deploy OMG with initial funding of: ', INITIAL_FUNDING)
  deployer.deploy(TokenOMG, toWei(INITIAL_FUNDING).toString())
}
