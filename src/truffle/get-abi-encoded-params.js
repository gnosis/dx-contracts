/* global artifacts */
/* eslint no-undef: "error" */

var abi = require('ethereumjs-abi')

async function getAbiEncodedParams () {
  const DutchExchange = artifacts.require('DutchExchange')
  const TokenFRT = artifacts.require('TokenFRT')

  const dxMasterAddress = DutchExchange.address
  const frt = await TokenFRT.deployed()
  const owner = await frt.owner.call()

  const dxProxyParams = _getAbiEncodedParams([ 'address' ], [ dxMasterAddress ])
  const frtParams = _getAbiEncodedParams([ 'address' ], [ owner ])

  console.log('Abi encoded params')
  console.log('------------------')
  console.log('\tDutchExchangeProxy params: %s', dxProxyParams)
  console.log('\tTokenFRT params: %s', frtParams)
}

function _getAbiEncodedParams (parameterTypes, parameterValues) {
  var encoded = abi.rawEncode(parameterTypes, parameterValues)

  return encoded.toString('hex')
}

module.exports = callback => {
  getAbiEncodedParams()
    .then(callback)
    .catch(callback)
}
