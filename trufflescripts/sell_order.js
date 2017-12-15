const DutchExchangeETHGNO = artifacts.require('./DutchExchangeETHGNO.sol')
const TokenETH = artifacts.require('./EtherToken.sol')
const TokenGNO = artifacts.require('./TokenGNO.sol')

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

const { getTime } = require('./utils')(web3)

/**
 * truffle exec trufflescripts/buy_order.js
 * to post a sell order to the current auction as the seller
 * @flags:
 * -n <number>          for a specific amount of sellToken
 * --sell <token_code>  sell a specific token (ETH by default)
 * --buy <token_code>   buy a specific token (GNO by default)
 * --wiz <number>       and burn this amount of WIZ (0 by default)
 * --buyer              as the buyer
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

  const latestIndex = (await dx.latestAuctionIndices(sellToken, buyToken)).toNumber()
  const auctionStart = (await dx.auctionStarts(sellToken, buyToken)).toNumber()

  let auctionIndex
  if (getTime() < auctionStart) {
    auctionIndex = latestIndex
    console.log(`Posting sell order to the current (${auctionIndex}) not yet started auction`)
  } else {
    auctionIndex = latestIndex + 1
    console.log(`Posting sell order to the next (${auctionIndex}) auction`)
  }

  let seller
  if (argv.a) seller = argv.a
  else if (argv.buyer)[, , seller] = web3.eth.accounts
  else {
    [, seller] = web3.eth.accounts
  }

  const sellerStats = () => Promise.all([
    dx.sellVolumes(sellToken, buyToken, auctionIndex),
    dx.sellerBalances(sellToken, buyToken, auctionIndex, seller),
    dx.balances(sellToken, seller),
  ]).then(res => res.map(n => n.toNumber()))

  let [sellVolume, sellerBalance, sellerDeposit] = await sellerStats()

  console.log(`Auction ${sellTokenName} -> ${buyTokenName} index ${auctionIndex}
  was:
    sellVolume:\t${sellVolume}
    sellerBalance:\t${sellerBalance} in auction
    sellerDeposit:\t${sellerDeposit} ${sellTokenName}
  `)

  if (argv.n === undefined) {
    console.warn('No amount provided')
    return
  }

  console.log(`
  Posting order for ${argv.n}
  `)

  try {
    await dx.postSellOrder(sellToken, buyToken, auctionIndex, argv.n, argv.wiz || 0, { from: seller })
  } catch (error) {
    console.error(error.message || error)
  }

  [sellVolume, sellerBalance, sellerDeposit] = await sellerStats()

  console.log(`  now:
    sellVolume:\t${sellVolume}
    sellerBalance:\t${sellerBalance} in auction
    sellerDeposit:\t${sellerDeposit} ${sellTokenName}
`)
}
