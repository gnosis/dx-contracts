/* eslint no-console:0 */
const {
  deployed,
  getTokenDeposits,
  getAccountsStatsForTokenPairAuction,
  getExchangeStatsForTokenPair,
  claimBuyerFunds,
  claimSellerFunds,
  getUnclaimedBuyerFunds,
  getUnclaimedSellerFunds,
} = require('./utils/contracts')(artifacts)
const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/claim_funds.js
 * to claim funds for the current auction for both seller and buyer,
 * from auction's sellerBalances and buyerBalances respectively
 * @flags:
 * --seller                     sellerBalance for seller only
 * --buyer                      buyerBalance for buyer only
 * -a seller|buyer|master|<address>    for the given address
 * -i <index>                   for auction with given index
 * --last                       for last auction
 */

module.exports = async () => {
  const { eth: sellToken, gno: buyToken } = await deployed
  const sellTokenName = 'ETH'
  const buyTokenName = 'GNO'

  let index = argv.i !== undefined ? argv.i
    : (await getExchangeStatsForTokenPair({ sellToken, buyToken })).latestAuctionIndex
  if (argv.i === undefined && argv.last) index -= 1
  // eslint-disable-next-line
  let [master, seller, buyer] = web3.eth.accounts

  if (argv.a === 'seller') buyer = seller
  else if (argv.a === 'buyer') seller = buyer
  else if (argv.a === 'master') seller = buyer = master
  else if (argv.a) seller = buyer = argv.a

  const getStats = async (account, role) => {
    const [
      { [account]: { sellerBalance, buyerBalance, claimedAmount } },
      { [sellTokenName]: sellTokenDeposit = 0, [buyTokenName]: buyTokenDeposit = 0 },
      [unclaimedAmount] = [],
    ] = await Promise.all([
      getAccountsStatsForTokenPairAuction({ sellToken, buyToken, index, accounts: [account] }),
      getTokenDeposits(account),
      (role === 'seller' ? getUnclaimedSellerFunds : getUnclaimedBuyerFunds)({ sellToken, buyToken, user: account, index }),
    ])

    return { sellerBalance, buyerBalance, claimedAmount, sellTokenDeposit, buyTokenDeposit, unclaimedAmount }
  }

  const printSeller = async () => {
    let { sellerBalance, claimedAmount, unclaimedAmount, sellTokenDeposit } = await getStats(seller, 'seller')

    console.log(`
    Seller\tbalance\tunclaimed  \tclaimed\tdeposit
    was:\t${sellerBalance}\t${unclaimedAmount}\t\t${claimedAmount}\t${sellTokenDeposit}`)

    await claimSellerFunds({ sellToken, buyToken, user: seller, index });

    ({ sellerBalance, claimedAmount, unclaimedAmount, sellTokenDeposit } = await getStats(seller, 'seller'))

    console.log(`    is:\t\t${sellerBalance}\t${unclaimedAmount}\t\t${claimedAmount}\t${sellTokenDeposit}`)
  }

  const printBuyer = async () => {
    let { buyerBalance, claimedAmount, unclaimedAmount, buyTokenDeposit } = await getStats(buyer, 'buyer')

    console.log(`
    Buyer\tbalance\tunclaimed  \tclaimed\tdeposit
    was:\t${buyerBalance}\t${unclaimedAmount}\t\t${claimedAmount}\t${buyTokenDeposit}
    `)

    await claimBuyerFunds({ sellToken, buyToken, user: buyer, index });

    ({ buyerBalance, claimedAmount, unclaimedAmount, buyTokenDeposit } = await getStats(buyer, 'buyer'))

    console.log(`    is:\t\t${buyerBalance}\t${unclaimedAmount}\t\t${claimedAmount}\t${buyTokenDeposit}`)
  }

  console.log(`in auction ${index}`)

  if (argv.seller) {
    await printSeller()
  } else if (argv.buyer) {
    await printBuyer()
  } else {
    await printSeller()
    await printBuyer()
  }
}
