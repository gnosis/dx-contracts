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
console.log(argv)

/**
 * truffle exec trufflescripts/start_auction.js
 * add a token pair and sets time to auction start + 1 hour
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
  if ((!argv.seller && !argv.buyer && !argv.a)
    || ((argv.pair && argv.pair.length < 2) || (argv.fund && argv.fund < 2) || (argv.price && argv.price < 2))) {
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

  const [sellTokenFunding, buyTokenFunding] = argv.fund ? argv.fund.split(',') : [500, 500]

  if (sellTokenFunding <= 0 || buyTokenFunding <= 0) {
    console.warn('Funding must be a positive number')
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
  } else {
    // set Seller as default account
    [account] = accounts
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
      console.log('tokensToGive', tokensToGive)
      await giveTokens(account, tokensToGive, master)
    }

    console.log(`Depositing ${neededSellDeposit} ${SELL}, ${neededBuyDeposit} ${BUY}\n`)
    // no negative deposits
    const tokensToDeposit = { [SELL]: Math.max(0, neededSellDeposit), [BUY]: Math.max(0, neededBuyDeposit) }
    console.log('tokensToDeposit', tokensToDeposit)
    await depositToDX(account, tokensToDeposit)
  }

  const { sellFundingNewTokenPair } = await getExchangeParams()
  console.log('sellFundingNewTokenPair:', sellFundingNewTokenPair)

  const ETHUSDPrice = (await po.getUSDETHPrice()).toNumber()

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

  console.log('fundedValueUSD', fundedValueUSD)
  const underfunded = fundedValueUSD < sellFundingNewTokenPair
  if (underfunded) {
    console.log('\nfunded value < sellFundingNewTokenPair')
    console.log('To add the token pair, temporarily setting sellFundingNewTokenPair = 0')
    await updateExchangeParams({ sellFundingNewTokenPair: 0 })
    console.log('sellFundingNewTokenPair:', (await getExchangeParams()).sellFundingNewTokenPair)
  }

  console.log(`Adding a new token pair ${SELL} -> ${BUY}`)
  console.log(`${SELL} funding ${sellTokenFunding}\t${BUY} funding ${buyTokenFunding}`)
  console.log(`InitialclosingPrice: ${closingNum}/${closingDen} = ${closingNum / closingDen}`)

  await addTokenPair({
    account,
    sellToken,
    buyToken,
    sellTokenFunding,
    buyTokenFunding,
    initialClosingPriceNum: closingNum,
    initialClosingPriceDen: closingDen,
  })

  if (underfunded) {
    console.log('Setting sellFundingNewTokenPair back to', sellFundingNewTokenPair)
    await updateExchangeParams({ sellFundingNewTokenPair })
  }


  // Grab Deposited Token Balances in Auction (if any)
  // const balances = acct => Promise.all([
  //   dx.balances(eth.address, acct),
  //   dx.balances(gno.address, acct),
  // ]).then(res => res.map(bal => bal.toNumber()))

  // const [ethBalance, gnoBalance] = await balances(account)
  // console.log(`
  //   --> DX Ether Balance = ${ethBalance}
  //   --> DX GNO Balance   = ${gnoBalance}
  // `)

  // try {
  //   await sellToken.approve.call(dx.address, 10000, { from: account })
  //   await buyToken.approve.call(dx.address, 10000, { from: account })
    
  //   console.log(`
  //   --> Approved sellToken + buyToken movement by DX
  //   `)

  //   const { sellFundingNewTokenPair } = await getExchangeParams()
  //   console.log('sellFuncingNewTokenPair:', sellFundingNewTokenPair)
    
  //   await dx.addTokenPair(
  //     sellToken.address,
  //     buyToken.address,
  //     (argv._[2] || 500),
  //     (argv._[3] || 500),
  //     2,
  //     1,
  //     { from: account },
  //   )
  // } catch (e) {
  //   console.log(`
  //   ERROR
  //   ---------------------------  
  //   ${e}
  //   ---------------------------
  //   `)
  // }

  // const auctionStart = (await dx.auctionStarts.call(sellToken.address, buyToken.address)).toNumber()
  // const now = getTime()
  // const timeUntilStart = auctionStart - now

  // const auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()

  // // auctionStart is in the future
  // if (timeUntilStart > 0) {
  //   increaseTimeBy(timeUntilStart + hour)
  //   console.log(`ETH -> GNO auction ${auctionIndex} started`)
  // } else {
  //   console.log(`ETH -> GNO auction ${auctionIndex} is already running`)
  // }
}
