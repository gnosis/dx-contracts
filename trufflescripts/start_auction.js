/* eslint no-console:0 */
const {
  deployed,
  getExchangeParams,
  getTokenDeposits,
  getTokenBalances,
  giveTokens,
  depositToDX,
  getExchangeStatsForTokenPair,
  addTokenPair,
  updateExchangeParams,
} = require('./utils/contracts')(artifacts)

const { getTime, increaseTimeBy } = require('./utils')(web3)
const argv = require('minimist')(process.argv.slice(4), { string: 'a' })

/**
 * truffle exec test/trufflescripts/start_auction.js
 * add a token pair as master account and sets time to auction start + 1 hour
 * @flags:
 * --pair <sellToken,buyToken>                 add token pair, eth, gno by default
 * --fund <sellTokenFunding,buyTokenFunding>   prefund auction, 500, 500 by default
 * --price <num/den>                           initial closing price, 2/1 by default
 * --seller           as the seller
 * --buyer            as the buyer
 * -a <address>       as the given address
 */

const hour = 3600

module.exports = async () => {
  if ((argv.pair && argv.pair.length < 2) || (argv.fund && argv.fund < 2) || (argv.price && argv.price < 2)) {
    console.warn('No valid token pair, fund or accounts specified')
    return
  }

  const { dx, po, ...tokens } = await deployed

  const [sell, buy] = argv.pair ? argv.pair.split(',') : ['eth', 'gno']
  const { [sell]: sellToken, [buy]: buyToken } = tokens

  if (!sellToken || !buyToken) {
    console.warn(`Unknown tokens (${sell}, ${buy}) specified. Aborting`)
    return
  }

  let { auctionStart, latestAuctionIndex } = await getExchangeStatsForTokenPair({ sellToken, buyToken })

  const fastForward = () => {
    const now = getTime()
    const timeUntilStart = auctionStart - now

    // auctionStart is in the future
    if (timeUntilStart > 0) {
      console.log('auctionStart is set in the future. Skipping to it + 1 hour')
      increaseTimeBy(timeUntilStart + hour)
      console.log(`${sell.toUpperCase()} -> ${buy.toUpperCase()} auction ${latestAuctionIndex} started`)
    }
  }

  // TokenPair already added
  if (latestAuctionIndex > 0) {
    fastForward()
    return
  }

  // if sellVolume of opposite auction (made up from token2Funding)isn't 0,
  // auctionIndex isn't automatically increased on ClearAuction
  const [sellTokenFunding, buyTokenFunding] = argv.fund ? argv.fund.split(',') : [500, 0]

  if (sellTokenFunding < 0 || buyTokenFunding < 0) {
    console.warn('Funding must be a positive number or 0')
    return
  }

  const [closingNum, closingDen] = argv.price ? argv.price.split('/') : [2, 1]

  if (closingNum <= 0 || closingDen <= 0) {
    console.warn('Price must be a positive number')
    return
  }

  const [master, ...accounts] = web3.eth.accounts
  let account
  if (argv.a) account = argv.a
  else if (argv.buyer) {
    [, account] = accounts
  } else if (argv.seller) {
    [account] = accounts
  } else {
    // set Master as default account
    account = master
  }

  const SELL = sell.toUpperCase()
  const BUY = buy.toUpperCase()

  const { [SELL]: sellTokenDeposit, [BUY]: buyTokenDeposit } = await getTokenDeposits(account)

  if (sellTokenDeposit < sellTokenFunding || buyTokenDeposit < buyTokenFunding) {
    console.log('\nNot enough tokens deposited to fund the pair')

    const neededSellDeposit = sellTokenFunding - sellTokenDeposit
    const neededBuyDeposit = buyTokenFunding - buyTokenDeposit

    const { [SELL]: sellBalance, [BUY]: buyBalance } = await getTokenBalances(account)
    const neededSellBalance = neededSellDeposit - sellBalance
    const neededBuyBalance = neededBuyDeposit - buyBalance

    if (neededSellBalance > 0 || neededBuyBalance > 0) {
      console.log('\nNot enough token balances to cover the deposits necessary')
      console.log(`Supplying account with ${neededSellBalance} ${SELL}, ${neededBuyBalance} ${BUY}`)

      // no negative balances
      const tokensToGive = { [SELL]: Math.max(0, neededSellBalance), [BUY]: Math.max(0, neededBuyBalance) }
      await giveTokens(account, tokensToGive, master)
    }

    console.log(`Depositing ${neededSellDeposit} ${SELL}, ${neededBuyDeposit} ${BUY}\n`)
    // no negative deposits
    const tokensToDeposit = { [SELL]: Math.max(0, neededSellDeposit), [BUY]: Math.max(0, neededBuyDeposit) }
    await depositToDX(account, tokensToDeposit)
  }

  // TODO: fails here - dx.updateExchangeParams is not a function
  const { thresholdNewTokenPair } = await getExchangeParams()

  const ETHUSDPrice = (await po.getUSDETHPrice()).toNumber()

  // calculating funded value, depends on oracle price
  let fundedValueUSD
  if (SELL === 'ETH') {
    fundedValueUSD = sellTokenFunding * ETHUSDPrice
  } else if (BUY === 'ETH') {
    fundedValueUSD = buyTokenFunding * ETHUSDPrice
  } else {
    // Neither token is ETH
    const { sellTokenOraclePrice, buyTokenOraclePrice } = await getExchangeStatsForTokenPair({ sellToken, buyToken })

    const [sNum, sDen] = sellTokenOraclePrice
    const [bNum, bDen] = buyTokenOraclePrice

    fundedValueUSD = (((sellTokenFunding * sNum) / sDen) + ((buyTokenFunding * bNum) / bDen)) * ETHUSDPrice
  }

  console.log('fundedValueUSD was calculated as', fundedValueUSD)
  const underfunded = fundedValueUSD < thresholdNewTokenPair
  if (underfunded) {
    console.log(`\nfunded value (${fundedValueUSD}) < thresholdNewTokenPair (${thresholdNewTokenPair})`)
    console.log('To add the token pair, temporarily setting thresholdNewTokenPair = 0')
    await updateExchangeParams({ thresholdNewTokenPair: 0 })
    console.log('thresholdNewTokenPair:', (await getExchangeParams()).thresholdNewTokenPair)
  }

  console.log(`Adding a new token pair ${SELL} -> ${BUY}`)
  console.log(`${SELL} funding ${sellTokenFunding},\t${BUY} funding ${buyTokenFunding}`)
  console.log(`InitialclosingPrice: ${closingNum}/${closingDen} = ${closingNum / closingDen}`)

  const tx = await addTokenPair({
    account,
    sellToken,
    buyToken,
    sellTokenFunding,
    buyTokenFunding,
    initialClosingPriceNum: closingNum,
    initialClosingPriceDen: closingDen,
  })

  if (underfunded) {
    console.log('Setting thresholdNewTokenPair back to', thresholdNewTokenPair)
    await updateExchangeParams({ thresholdNewTokenPair })
  }

  ({ auctionStart, latestAuctionIndex } = await getExchangeStatsForTokenPair({ sellToken, buyToken }))

  if (tx) {
    console.log(`${SELL} -> ${BUY} auction ${latestAuctionIndex} started`)
    fastForward()
  }
}
