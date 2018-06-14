/* eslint no-console:0 */
const {
  deployed,
  getTokenDeposits,
  getAccountsStatsForTokenPairAuction,
  getExchangeStatsForTokenPair,
  postBuyOrder,
} = require('./utils/contracts')(artifacts)
const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/buy_order.js
 * to post a buy order to token pair auction as the buyer
 * @flags:
 * -n <number>                    for a specific amount of buyToken
 * --pair <sellToken,buyToken>    token pair auction, eth,gno by default
 * --seller                       as the seller
 * -a <address>                   as the given account
 * --next                         to the next auction (lastAuctionIndex + 1)
 */


module.exports = async () => {
  const { eth, gno } = await deployed
  const availableTokens = { eth, gno }

  const [sell, buy] = argv.pair ? argv.pair.split(',') : ['eth', 'gno']
  let sellToken = availableTokens[sell.toLowerCase()] || eth
  let buyToken = availableTokens[buy.toLowerCase()] || gno

  if (!sellToken || !buyToken) {
    console.warn(`Token ${!sellToken || !buyToken} is not available`)
    return
  }

  if (argv.n === undefined) {
    console.warn('No amount provided')
    return
  }

  sellToken = sellToken.address
  buyToken = buyToken.address

  const sellTokenName = sell ? sell.toUpperCase() : 'ETH'
  const buyTokenName = buy ? buy.toUpperCase() : 'GNO'

  let account
  if (argv.a) account = argv.a
  else if (argv.seller)[, account] = web3.eth.accounts
  else {
    [, , account] = web3.eth.accounts
  }

  let { [buyTokenName]: buyTokenDeposit = 0 } = await getTokenDeposits(account)

  if (buyTokenDeposit < argv.n) {
    console.log(`Account's deposit is ${argv.n - buyTokenDeposit} tokens short to submit this order`)
    return
  }

  const { latestAuctionIndex } = await getExchangeStatsForTokenPair({ sellToken, buyToken })

  const index = argv.next ? latestAuctionIndex + 1 : latestAuctionIndex

  let [{ buyVolume }, { [account]: { buyerBalance } }] = await Promise.all([
    getExchangeStatsForTokenPair({ sellToken, buyToken }),
    getAccountsStatsForTokenPairAuction({ sellToken, buyToken, index, accounts: [account] }),
  ])

  console.log(`Auction ${sellTokenName} -> ${buyTokenName} index ${index} (${argv.next ? 'next' : 'current'})
  was:
    buyVolume:\t${buyVolume}
    buyerBalance:\t${buyerBalance} in auction
    buyerDeposit:\t${buyTokenDeposit} ${buyTokenName}
  `)


  console.log(`
  Posting order for ${argv.n} ${buyTokenName}
  `)

  const tx = await postBuyOrder(account, { sellToken, buyToken, index, amount: argv.n })
  if (!tx) return

  [
    { [buyTokenName]: buyTokenDeposit = 0 },
    { buyVolume },
    { [account]: { buyerBalance } },
  ] = await Promise.all([
    getTokenDeposits(account),
    getExchangeStatsForTokenPair({ sellToken, buyToken }),
    getAccountsStatsForTokenPairAuction({ sellToken, buyToken, index, accounts: [account] }),
  ])


  console.log(`  now:
    buyVolume:\t${buyVolume}
    buyerBalance:\t${buyerBalance} in auction
    buyerDeposit:\t${buyTokenDeposit} ${buyTokenName}
`)
}
