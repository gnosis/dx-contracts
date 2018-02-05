/* eslint no-multi-spaces: 0, no-console: 0 */

const Math = artifacts.require('Math')

const DutchExchange = artifacts.require('DutchExchange')
const EtherToken = artifacts.require('EtherToken')
const PriceFeed = artifacts.require('PriceFeed')
const PriceOracleInterface = artifacts.require('PriceOracleInterface')
const StandardToken = artifacts.require('StandardToken')
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
  deployer.deploy(Math)

    // Linking
    .then(() => deployer.link(Math, [StandardToken, EtherToken, TokenGNO, TokenTUL, TokenOWL, TokenOWLProxy, OWLAirdrop]))

    // Deployment of Tokens
    .then(() => deployer.deploy(EtherToken))
    .then(() => deployer.deploy(TokenGNO, 100000 * (10 ** 18)))
    .then(() => deployer.deploy(TokenTUL, accounts[0], accounts[0]))
    .then(() => deployer.deploy(TokenOWL))
    .then(() => deployer.deploy(TokenOWLProxy, TokenOWL.address))

    // StandardToken is NECESSARRY to deploy here as it is LINKED w/Math
    .then(() => deployer.deploy(StandardToken))

    // Deployment of PriceFeedInfrastructure
    .then(() => deployer.deploy(PriceFeed))
    .then(() => deployer.deploy(Medianizer))
    .then(() => deployer.deploy(PriceOracleInterface, accounts[0], Medianizer.address))
    .then(() => Medianizer.deployed())
    .then(M => M.set(PriceFeed.address, { from: accounts[0] }))
    .then(() => PriceFeed.deployed())
    .then(P => P.post(currentETHPrice, 1516168838 * 2, Medianizer.address, { from: accounts[0] }))

    // Deployment of DutchExchange
    .then(() => deployer.deploy(DutchExchange))
    .then(() => deployer.deploy(Proxy, DutchExchange.address))

    // @dev DX Constructor creates exchange
    .then(() => Proxy.deployed())
    .then(p => DutchExchange.at(p.address).setupDutchExchange(
      TokenTUL.address,
      TokenOWLProxy.address,
      accounts[0],                           // @param _owner will be the admin of the contract
      EtherToken.address,                   // @param _ETH               - address of ETH ERC-20 token
      PriceOracleInterface.address,        // @param _priceOracleAddress - address of priceOracle
      10000000000000000000000,            // @param _thresholdNewTokenPair: 10,000 dollar
      1000000000000000000000,            // @param _thresholdNewAuction:     1,000 dollar
    ))
    .then(() => TokenTUL.deployed())
    .then(T => T.updateMinter(Proxy.address))
}
