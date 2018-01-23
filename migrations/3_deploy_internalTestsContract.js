/* eslint no-multi-spaces: 0, no-console: 0 */

const Math = artifacts.require('Math')
const DutchExchange = artifacts.require('DutchExchange')
const InternalTests = artifacts.require('InternalTests')

module.exports = function deploy(deployer) {
  deployer.link(Math, InternalTests)
    .then(() => DutchExchange.deployed())
    .then((dx) => {
      const initParams = Promise.all([
        dx.TUL.call(),
        dx.OWL.call(),
        dx.owner.call(),
        dx.ETH.call(),
        dx.ETHUSDOracle.call(),
        dx.thresholdNewTokenPair.call(),
        dx.thresholdNewAuction.call(),
      ])


      return initParams
    }).then((initParams) => {
      return  deployer.deploy(InternalTests, ...initParams)
    })
}
