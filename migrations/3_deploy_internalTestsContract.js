/* eslint no-multi-spaces: 0, no-console: 0 */

const Math2 = artifacts.require('Math2')
const DutchExchange = artifacts.require('DutchExchange')
const InternalTests = artifacts.require('InternalTests')
const Proxy = artifacts.require('Proxy')


module.exports = function deploy(deployer) {
  deployer.link(Math2, InternalTests)
    .then(() => Proxy.deployed())
    .then((p) => {
      const initParams = Promise.all([
        DutchExchange.at(p.address).TUL.call(),
        DutchExchange.at(p.address).OWL.call(),
        DutchExchange.at(p.address).auctioneer.call(),
        DutchExchange.at(p.address).ETH.call(),
        DutchExchange.at(p.address).ETHUSDOracle.call(),
        DutchExchange.at(p.address).thresholdNewTokenPair.call(),
        DutchExchange.at(p.address).thresholdNewAuction.call(),
      ])


      return initParams
    }).then((initParams) => {
      return  deployer.deploy(InternalTests, ...initParams)
    })
}
