/* eslint no-console:0 */

const DutchExchange = artifacts.require('DutchExchange')
const EtherToken = artifacts.require('EtherToken')
const PriceOracle = artifacts.require('PriceOracle')
const StandardToken = artifacts.require('StandardToken')
const TokenGNO = artifacts.require('TokenGNO')

module.exports = (deployer, network, accounts) => {
 
//acounts to be used:
const [initialiser, seller1, seller2, buyer1, buyer2] = accounts
const intialFundingGNO = 10**16
const intialFundingWEI = 10**16
var  currentETHCENTSPrice = 60000
var firstAuctionFundingETH = 10 ** 9
var firstAuctionFundingGNO = 2*10 ** 9       

    // fund accounts with GNO
    buyToken = await TokenGNO.deployed()
    for (acct = 1; acct < 9; acct++) {
      await buyToken.transfer(accounts[acct], intialFundingGNO, { from: initialiser })
    }

    // distribute sell tokens
    sellToken = await EtherToken.deployed()

    // create dx
    dx = await DutchExchange.deployed()
    dxa = dx.address

    for (acct = 1; acct < 9; acct++) {
      // depoit into etherToken contract
      await sellToken.deposit({ from: accounts[acct], value: intialFundingWEI})

      // depositing into the exchange
      await sellToken.approve(dx.address, intialFundingWEI , { from: accounts[acct] })
      await dx.deposit(sellToken.address, intialFundingWEI , { from: accounts[acct] })

      await buyToken.approve(dx.address, intialFundingGNO, { from: accounts[acct] })
      await dx.deposit(buyToken.address, intialFundingGNO, { from: accounts[acct] })
    }


    // add token Pair
    oracle = await PriceOracle.deployed()
    // updating the oracle Price. Needs to be changed later to another mechanism
    await oracle.updateETHUSDPrice(currentETHCENTSPrice)





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
