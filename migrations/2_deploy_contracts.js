/* eslint no-multi-spaces: 0, no-console: 0 */

const Math = artifacts.require('Math')
const DutchExchange = artifacts.require('DutchExchange')
const EtherToken = artifacts.require('EtherToken')
const PriceFeed = artifacts.require('PriceFeed')
const PriceOracleInterface = artifacts.require('PriceOracleInterface')
const StandardToken = artifacts.require('StandardToken')
const TokenGNO = artifacts.require('TokenGNO')
const TokenOWL = artifacts.require('TokenOWL')
const TokenTUL = artifacts.require('TokenTUL')
const Medianizer = artifacts.require('Medianizer')

// ETH price as reported by MakerDAO with 18 decimal places
const currentETHPrice = (902 * (10 ** 18))

module.exports = function deploy(deployer, networks, accounts) {
  // let TULInstance;
  deployer.deploy(Math)
  // StandardToken is NECESSARRY to deploy here as it is LINKED w/Math
  deployer.link(Math, [DutchExchange, StandardToken, EtherToken, TokenGNO, TokenTUL, TokenOWL])

  deployer.deploy(EtherToken)
    .then(() => deployer.deploy(TokenGNO, 10000 * (10 ** 18)))
    .then(() => deployer.deploy(TokenTUL, accounts[0], accounts[0]))
    // StandardToken is NECESSARRY to deploy here as it is LINKED w/Math
    .then(() => deployer.deploy(StandardToken))
    .then(() => deployer.deploy(PriceFeed))
    .then(() => deployer.deploy(Medianizer))
    .then(() => deployer.deploy(PriceOracleInterface, accounts[0], Medianizer.address))
    .then(() => deployer.deploy(TokenOWL))
    // @dev DX Constructor creates exchange
    .then(() => deployer.deploy(
      DutchExchange,              // Contract Name
      TokenTUL.address,
      TokenOWL.address,
      accounts[0],                // @param _owner will be the admin of the contract
      EtherToken.address,         // @param _ETH                - address of ETH ERC-20 token
      PriceOracleInterface.address,        // @param _priceOracleAddress - address of priceOracle
      10000000000000000000000,
      1000000000000000000000,
    ))
    .then(() => Medianizer.deployed())
    .then(M => M.set(PriceFeed.address, { from: accounts[0] }))
    .then(() => PriceFeed.deployed())
    .then(P => P.post(currentETHPrice, 1516168838 * 2, Medianizer.address, { from: accounts[0] }))
    .then(() => TokenTUL.deployed())
    .then(T => T.updateMinter(DutchExchange.address))
}
