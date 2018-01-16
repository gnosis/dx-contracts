/* eslint no-multi-spaces: 0, no-console: 0 */

const Math = artifacts.require('Math')
const DutchExchange = artifacts.require('DutchExchange')
const EtherToken = artifacts.require('EtherToken')
const PriceOracle = artifacts.require('PriceOracle')
const StandardToken = artifacts.require('StandardToken')
const TokenGNO = artifacts.require('TokenGNO')
const TokenOWL = artifacts.require('TokenOWL')
const TokenTUL = artifacts.require('TokenTUL')
const InternalTests = artifacts.require('InternalTests')

module.exports = function deploy(deployer, networks, accounts) {
  let PriceOracleInstance
  // let TULInstance;
  deployer.deploy(Math)
  // StandardToken is NECESSARRY to deploy here as it is LINKED w/Math
  deployer.link(Math, [PriceOracle, DutchExchange, StandardToken, EtherToken, TokenGNO, TokenTUL, TokenOWL])

  deployer.deploy(EtherToken)
    .then(() => deployer.deploy(TokenGNO, 10000 * (10 ** 18)))
    .then(() => deployer.deploy(TokenTUL, accounts[0], accounts[0]))
    // StandardToken is NECESSARRY to deploy here as it is LINKED w/Math
    .then(() => deployer.deploy(StandardToken))
    .then(() => deployer.deploy(PriceOracle, accounts[0], EtherToken.address))
    .then(() => PriceOracle.deployed())
    .then((p) => {
      PriceOracleInstance = p
      return deployer.deploy(TokenOWL, TokenGNO.address /* ,PriceOracle.adress */, 0)
    })
    // @dev DX Constructor creates exchange
    .then(() => deployer.deploy(
      DutchExchange,              // Contract Name
      TokenTUL.address,
      TokenOWL.address,
      accounts[0],                // @param _owner will be the admin of the contract
      EtherToken.address,         // @param _ETH                - address of ETH ERC-20 token
      PriceOracle.address,        // @param _priceOracleAddress - address of priceOracle
      10000,
      1000,
    ))
    .then(() => PriceOracleInstance.updateDutchExchange(DutchExchange.address, { from: accounts[0] }))
    .then(() => TokenTUL.deployed())
    .then(T => T.updateMinter(DutchExchange.address))
    // .then(() => deployer.deploy(
    //   InternalTests,              // Contract Name
    //   TokenTUL.address,
    //   TokenOWL.address,
    //   accounts[0],                // @param _owner will be the admin of the contract
    //   EtherToken.address,         // @param _ETH                - address of ETH ERC-20 token
    //   PriceOracle.address,        // @param _priceOracleAddress - address of priceOracle
    //   10000,
    //   1000,
    //   { gas: 4000000 }
    // ))
}
