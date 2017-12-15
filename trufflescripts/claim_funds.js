const DutchExchangeETHGNO = artifacts.require('./DutchExchangeETHGNO.sol')

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec trufflescripts/claim_funds.js
 * to claim funds for the current auction for both seller and buyer,
 * from auction's sellerBalances and buyerBalances respectively
 * @flags:
 * --seller                     sellerBalance for seller only
 * --buyer                      buyerBalance for buyer only
 * -a seller|buyer|<address>    for the given address
 * -i <index>                   for auction with given index
 * --last                       for last auction
 */

module.exports = async () => {
  const dx = await DutchExchangeETHGNO.deployed()

  let auctionIndex = argv.i !== undefined ? argv.i : (await dx.auctionIndex()).toNumber()
  if (argv.i === undefined && argv.last) auctionIndex -= 1

  let [, seller, buyer] = web3.eth.accounts

  if (argv.a === 'seller') buyer = seller
  else if (argv.a === 'buyer') seller = buyer
  else if (argv.a) seller = buyer = argv.a

  const sellerStats = () => Promise.all([
    dx.sellerBalances(auctionIndex, seller),
    dx.claimedAmounts(auctionIndex, seller),
  ]).then(res => res.map(n => n.toNumber()))

  const buyerStats = () => Promise.all([
    dx.buyerBalances(auctionIndex, buyer),
    dx.claimedAmounts(auctionIndex, buyer),
  ]).then(res => res.map(n => n.toNumber()))

  const printSeller = async () => {
    let [sellerBalance, sellerClaimed] = await sellerStats()

    console.log(`
    Seller\tbalance\tclaimed
    was:\t${sellerBalance}\t${sellerClaimed}`)

    try {
      await dx.claimSellerFunds(auctionIndex, { from: seller });

      [sellerBalance, sellerClaimed] = await sellerStats()

      console.log(`    is:\t\t${sellerBalance}\t${sellerClaimed}`)
    } catch (error) {
      console.error(error.message || error)
    }
  }

  const printBuyer = async () => {
    let [buyerBalance, buyerClaimed] = await buyerStats()

    console.log(`
    Buyer\tbalance\tclaimed
    was:\t${buyerBalance}\t${buyerClaimed}
    `)

    try {
      await dx.claimBuyerFunds(auctionIndex, { from: buyer });

      [buyerBalance, buyerClaimed] = await buyerStats()
      console.log(`    is:\t\t${buyerBalance}\t${buyerClaimed}`)
    } catch (error) {
      console.error(error.message || error)
    }
  }

  console.log(`in auction ${auctionIndex}`)

  if (argv.seller) {
    await printSeller()
  } else if (argv.buyer) {
    await printBuyer()
  } else {
    await printSeller()
    await printBuyer()
  }
}
