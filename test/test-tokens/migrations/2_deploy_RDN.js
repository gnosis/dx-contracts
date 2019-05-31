/* global artifacts, web3 */
/* eslint no-undef: "error" */

const TokenRDN = artifacts.require('TokenRDN')
const INITIAL_FUNDING = 100e6 // 100M

const { toWei } = require('./util/migrationUtils')({
  web3
})

module.exports = function (deployer) {
  console.log('Deploy RDN with initial funding of: ', INITIAL_FUNDING)
  deployer.deploy(TokenRDN, toWei(INITIAL_FUNDING).toString())
}
