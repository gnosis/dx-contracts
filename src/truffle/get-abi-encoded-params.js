/* global artifacts, web3 */
/* eslint no-undef: "error" */

var abi = require('ethereumjs-abi')

async function getAbiEncodedParams () {
  const DutchExchange = artifacts.require('DutchExchange')

  var parameterTypes = [ 'address' ]
  var parameterValues = [ DutchExchange.address ]
  var encoded = abi.rawEncode(parameterTypes, parameterValues)
  console.log('Abi encoded params')
  console.log('------------------')
  console.log('\tDutchExchangeProxy params: %s', encoded.toString('hex'))
}

module.exports = callback => {
  getAbiEncodedParams()
    .then(callback)
    .catch(callback)
}
