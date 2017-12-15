const TokenETH = artifacts.require('./EtherToken.sol')
const TokenGNO = artifacts.require('./TokenGNO.sol')

const sellerETH = 100
const buyerGNO = 1000

/**
 * truffle exec trufflescripts/topup_accounts.js
 * transfers seller 100 RTH and buyer 1000 GNO from master account
 */

module.exports = async () => {
  // web3 is available in the global context
  const [master, seller, buyer] = web3.eth.accounts

  const eth = await TokenETH.deployed()
  const gno = await TokenGNO.deployed()

  let sellerETHBalance = (await eth.balanceOf(seller)).toNumber()
  let buyerGNOBalance = (await gno.balanceOf(buyer)).toNumber()

  if (sellerETHBalance < sellerETH) {
    const remainder = sellerETH - sellerETHBalance
    await eth.approve(seller, remainder, { from: master })
    await eth.transferFrom(master, seller, sellerETH, { from: seller })
  }

  if (buyerGNOBalance < buyerGNO) {
    // allowance with a big margin
    await gno.approve(buyer, buyerGNO * 10, { from: master })
    await gno.transferFrom(master, buyer, buyerGNO - buyerGNOBalance, { from: buyer })
  }

  sellerETHBalance = (await eth.balanceOf(seller)).toNumber()
  buyerGNOBalance = (await gno.balanceOf(buyer)).toNumber()

  console.log('Seller ETH:', sellerETHBalance)
  console.log('Buyer GNO:', buyerGNOBalance)
}
