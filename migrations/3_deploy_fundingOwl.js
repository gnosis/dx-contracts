/* eslint no-multi-spaces: 0, no-console: 0 */

const DutchExchange = artifacts.require('DutchExchange')
const TokenGNO = artifacts.require('TokenGNO')
const TokenOWL = artifacts.require('TokenOWL')
const TokenOWLProxy = artifacts.require('TokenOWLProxy')
const TokenTUL = artifacts.require('TokenTUL')
const Medianizer = artifacts.require('Medianizer')
const Proxy = artifacts.require('Proxy')
const OWLAirdrop = artifacts.require('OWLAirdrop')
// ETH price as reported by MakerDAO with 18 decimal places
const currentETHPrice = (1100 * (10 ** 18))

module.exports = function deploy(deployer, networks, accounts) {
      
    //Generating enough OWL for testing
    const t = (web3.eth.getBlock('pending')).timestamp
    deployer.deploy(OWLAirdrop, TokenOWLProxy.address, TokenGNO.address, (t + 30 * 60 * 60))
    .then(() => TokenGNO.deployed())
    .then(T => T.approve(OWLAirdrop.address, 50000 * (10 ** 18)))
    .then(() => TokenOWLProxy.deployed())
    .then(T => TokenOWL.at(T.address).setMinter(OWLAirdrop.address))
    .then(() => OWLAirdrop.deployed())
    .then(A => A.lockGNO(50000 * (10 ** 18)))
    .then(() => TokenOWLProxy.deployed())
    .then(T => TokenOWL.at(T.address).balanceOf(accounts[0]))
}
