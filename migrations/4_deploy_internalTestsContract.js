/* eslint no-multi-spaces: 0, no-console: 0 */

const DutchExchange = artifacts.require('DutchExchange')
const InternalTests = artifacts.require('InternalTests')
const proxy = artifacts.require('Proxy')


module.exports = function deploy(deployer, networks, accounts) {
  deployer
    .then(() => proxy.deployed())
    .then((p) => {
      const dx = DutchExchange.at(p.address)

      const initParams = Promise.all([
        dx.TUL.call(),
        dx.OWL.call(),
        dx.auctioneer.call(),
        dx.ETH.call(),
        dx.ETHUSDOracle.call(),
        dx.thresholdNewTokenPair.call(),
        dx.thresholdNewAuction.call(),
      ])
      return initParams
    }).then(initParams => deployer.deploy(InternalTests, ...initParams))
}
