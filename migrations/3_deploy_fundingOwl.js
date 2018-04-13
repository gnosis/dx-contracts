/* eslint no-multi-spaces: 0, no-console: 0 */

const DutchExchange = artifacts.require('DutchExchange')
const TokenGNO = artifacts.require('TokenGNO')
const TokenOWL = artifacts.require('TokenOWL')
const TokenOWLProxy = artifacts.require('TokenOWLProxy')
const TokenMGN = artifacts.require('TokenMGN')
const Medianizer = artifacts.require('Medianizer')
const Proxy = artifacts.require('Proxy')
const OWLAirdrop = artifacts.require('OWLAirdrop')
// ETH price as reported by MakerDAO with 18 decimal places
const currentETHPrice = (1100 * (10 ** 18))

module.exports = function deploy(deployer, networks, accounts) {
      
     if (network == 'mainnet'){
	     deployer	
	    .then(() => TokenOWLProxy.deployed())
	    .then(T => TokenOWL.at(T.address).setMinter(OWLAirdrop.address))
     }else {
	    //Generating enough OWL for testing
	    deployer
	    .then((t) => TokenGNO.deployed())
	    .then(T => T.approve(OWLAirdrop.address, 50000 * (10 ** 18)))
	    .then(() => TokenOWLProxy.deployed())
	    .then(T => TokenOWL.at(T.address).setMinter(OWLAirdrop.address))
	    .then(() => OWLAirdrop.deployed())
	    .then(A => A.lockGNO(50000 * (10 ** 18)))
	}
}
