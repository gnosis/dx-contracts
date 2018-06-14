/* eslint no-console:0 */
const {
  deployed,
  getTokenDeposits,
  getAccountsStatsForTokenPairAuction,
  getExchangeStatsForTokenPair,
  postSellOrder,
} = require('./utils/contracts')(artifacts)
const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/sell_order.js
 * to post a sell order to token pair auction as the seller
 * @flags:
 * -n <number>                    for a specific amount of sellToken
 * --pair <sellToken,buyToken>    token pair auction, eth,gno by default
 * --buyer                        as the buyer
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
  else if (argv.buyer)[, , account] = web3.eth.accounts
  else {
    [, account] = web3.eth.accounts
  }

  let { [sellTokenName]: sellTokenDeposit = 0 } = await getTokenDeposits(account)

  if (sellTokenDeposit < argv.n) {
    console.log(`Account's deposit is ${argv.n - sellTokenDeposit} tokens short to submit this order`)
    return
  }

  const { latestAuctionIndex } = await getExchangeStatsForTokenPair({ sellToken, buyToken })

  const index = argv.next ? latestAuctionIndex + 1 : latestAuctionIndex

  let [{ sellVolumeCurrent, sellVolumeNext }, { [account]: { sellerBalance } }] = await Promise.all([
    getExchangeStatsForTokenPair({ sellToken, buyToken }),
    getAccountsStatsForTokenPairAuction({ sellToken, buyToken, index, accounts: [account] }),
  ])

  console.log(`Auction ${sellTokenName} -> ${buyTokenName} index ${index} (${argv.next ? 'next' : 'current'})
  was:
    sellVolumeCurrent:\t${sellVolumeCurrent}
    sellVolumeNext:\t${sellVolumeNext}
    sellerBalance:\t${sellerBalance} in auction
    sellerDeposit:\t${sellTokenDeposit} ${sellTokenName}
  `)


  console.log(`
  Posting order for ${argv.n} ${sellTokenName}
  `)

  const tx = await postSellOrder(account, { sellToken, buyToken, index, amount: argv.n })
  if (!tx) return

  [
    { [sellTokenName]: sellTokenDeposit = 0 },
    { sellVolumeCurrent, sellVolumeNext },
    { [account]: { sellerBalance } },
  ] = await Promise.all([
    getTokenDeposits(account),
    getExchangeStatsForTokenPair({ sellToken, buyToken }),
    getAccountsStatsForTokenPairAuction({ sellToken, buyToken, index, accounts: [account] }),
  ])


  console.log(`  now:
    sellVolumeCurrent:\t${sellVolumeCurrent}
    sellVolumeNext:\t${sellVolumeNext}
    sellerBalance:\t${sellerBalance} in auction
    sellerDeposit:\t${sellTokenDeposit} ${sellTokenName}
`)
}
