const DutchExchangeETHGNO = artifacts.require('./DutchExchangeETHGNO.sol')
const TokenETH = artifacts.require('./EtherToken.sol')
const TokenGNO = artifacts.require('./TokenGNO.sol')

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec trufflescripts/buy_order.js
 * to post a buy order to the current auction as the buyer
 * @flags:
 * -n <number>          for a specific amount of buyToken
 * --sell <token_code>  sell a specific token (ETH by default)
 * --buy <token_code>   buy a specific token (GNO by default)
 * --wiz <number>       and burn this amount of WIZ (0 by default)
 * --seller             as the seller
 * -a <address>         as the given account
 */


module.exports = async () => {
  const dx = await DutchExchangeETHGNO.deployed()
  const eth = await TokenETH.deployed()
  const gno = await TokenGNO.deployed()

  const availableTokens = { eth, gno }

  let sellToken = availableTokens[argv.sell && argv.sell.toLowerCase()] || eth
  let buyToken = availableTokens[argv.buy && argv.buy.toLowerCase()] || gno

  if (!sellToken || !buyToken) {
    console.warn(`Token ${!sellToken || !buyToken} is not available`)
    return
  }

  sellToken = sellToken.address
  buyToken = buyToken.address

  const sellTokenName = argv.sell ? argv.sell.toUpperCase() : 'ETH'
  const buyTokenName = argv.buy ? argv.buy.toUpperCase() : 'GNO'

  const auctionIndex = (await dx.latestAuctionIndices(sellToken, buyToken)).toNumber()

  console.log(`Posting buy order to the current (${auctionIndex}) auction`)

  let buyer
  if (argv.a) buyer = argv.a
  else if (argv.seller)[, buyer] = web3.eth.accounts
  else {
    [, , buyer] = web3.eth.accounts
  }

  const buyerStats = () => Promise.all([
    dx.buyVolumes(sellToken, buyToken, auctionIndex),
    dx.buyerBalances(sellToken, buyToken, auctionIndex, buyer),
    dx.balances(buyToken, buyer),
  ]).then(res => res.map(n => n.toNumber()))

  let [buyVolume, buyerBalance, buyerDeposit] = await buyerStats()

  console.log(`Auction ${sellTokenName} -> ${buyTokenName} index ${auctionIndex}
  was:
    buyVolume:\t${buyVolume}
    buyerBalance:\t${buyerBalance} in auction
    buyerDeposit:\t${buyerDeposit} ${buyTokenName}
  `)

  if (argv.n === undefined) {
    console.warn('No amount provided')
    return
  }

  console.log(`
  Posting order for ${argv.n}
  `)

  try {
    await dx.postBuyOrder(sellToken, buyToken, auctionIndex, argv.n, argv.wiz || 0, { from: buyer })
  } catch (error) {
    console.error(error.message || error)
  }

  [buyVolume, buyerBalance, buyerDeposit] = await buyerStats()

  const auctionCleared = (await dx.latestAuctionIndices(sellToken, buyToken)).toNumber() + 1 === auctionIndex

  console.log(`  now:
    buyVolume:\t${buyVolume}
    buyerBalance:\t${buyerBalance} in auction
    buyerDeposit:\t${buyerDeposit} ${buyTokenName}
    ${auctionCleared ? 'auction cleared with this buy order' : ''}
`)
}
