/* eslint no-console:0 */

const DutchExchange = artifacts.require('DutchExchange')
const EtherToken = artifacts.require('EtherToken')
const PriceOracle = artifacts.require('PriceOracle')
const StandardToken = artifacts.require('StandardToken')
const TokenGNO = artifacts.require('TokenGNO')

module.exports = (deployer, network, accounts) => {
  
  /*// let DX
  let ETH
  let GNO

  const [master, seller, buyer] = accounts

  deployer.then(() =>
    EtherToken.deployed().then((inst) => {
      ETH = inst
      return ETH.approve(seller, 1000, { from: master })
    }))

  deployer.then(() =>
    TokenGNO.deployed().then((inst) => {
      GNO = inst
      // transfer GNO to buyer and seller accounts
      GNO.transfer(buyer, 1000, { from: master })
      return GNO.transfer(seller, 1000, { from: master })
    }))

  deployer.then(() => ETH.deposit({ value: 50000, from: master }))
  deployer.then(() => ETH.deposit({ value: 1000, from: seller }))
  deployer.then(() => ETH.deposit({ value: 1000, from: buyer }))

  deployer.then(() => ETH.balanceOf(master))
    .then(bal => console.log('Master ETH balance', bal.toNumber()))
  deployer.then(() => ETH.balanceOf(seller))
    .then(bal => console.log('Seller ETH balance', bal.toNumber()))
  deployer.then(() => GNO.balanceOf(seller))
    .then(bal => console.log('Seller GNO balance', bal.toNumber()))*/

    
}
