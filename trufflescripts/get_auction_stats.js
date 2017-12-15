const DutchExchange = artifacts.require('DutchExchange')
const TokenETH = artifacts.require('EtherToken')
const TokenGNO = artifacts.require('TokenGNO')
const { getTime } = require('./utils')(web3)

const getTimeStr = (timestamp) => {
  const date = new Date(Math.abs(timestamp))
  const hh = date.getUTCHours()
  const mm = date.getUTCMinutes()
  const ss = date.getUTCSeconds()

  return `${hh ? `${hh} hour(s) ` : ''}${mm ? `${mm} minute(s) ` : ''}${ss ? `${ss} second(s) ` : ''}`
}

/**
 * truffle exec trufflescripts/get_auction_stats.js
 * prints stats for the current and past auctions
 */

/* eslint no-console: 0 */
module.exports = async () => {
  console.warn(`
    WARNING:
    --------------------------------------------------------------------------
    TESTS WILL NOT WORK IF PRICE_ORACLE DOES NOT YET SET A USD VALUE FOR ETHER!
    --------------------------------------------------------------------------
  `)
  const dx = await DutchExchange.deployed()
  const eth = await TokenETH.deployed()
  const gno = await TokenGNO.deployed()

  const dxETHBalance = (await eth.balanceOf.call(dx.address)).toNumber()
  const dxGNOBalance = (await gno.balanceOf.call(dx.address)).toNumber()

  console.log(`Auction holds:\t${dxETHBalance} ETH\t${dxGNOBalance} GNO`)

  const auctionStart = (await dx.auctionStarts.call(eth.address, gno.address)).toNumber()
  const now = getTime()

  const timeUntilStart = auctionStart - now
  const timeStr = getTimeStr(timeUntilStart * 1000)
  // console.log(timeStr)
  const auctionIndex = (await dx.latestAuctionIndices.call(eth.address, gno.address)).toNumber()
  // console.log(auctionIndex)
  const [, seller, buyer] = web3.eth.accounts

  const sellVolumeCurrent = (await dx.sellVolumes.call(eth.address, gno.address, auctionIndex)).toNumber()
  const sellVolumeNext = (await dx.sellVolumes.call(eth.address, gno.address, auctionIndex + 1)).toNumber()
  const sellerBalanceNext = sellVolumeNext &&
    (await dx.sellerBalances.call(eth.address, gno.address, auctionIndex + 1, seller)).toNumber()

  console.log(`
    Current auction index ${auctionIndex}
    ______________________________________
    now:\t\t\t${new Date(now * 1000).toTimeString()}
    auctionStart:\t\t${new Date(auctionStart * 1000).toTimeString()}
    ${timeUntilStart > 0 ? `starts in\t\t${timeStr}` : timeUntilStart < 0 ? `started\t\t${timeStr}ago` : 'just started'}
    
    sellVolumeCurrent:\t${sellVolumeCurrent}
    sellVolumeNext:\t${sellVolumeNext}${sellerBalanceNext ? `\n  sellerBalance for next auction:\t${sellerBalanceNext}` : ''}  
  `)


  // if auctionIndex === 3, indexes = [3, 2, 1]
  const indexes = Array.from({ length: auctionIndex }, (v, i) => auctionIndex - i)

  const readStats = async (i) => {
    const buyVolume = (await dx.buyVolumes.call(eth.address, gno.address, i)).toNumber()

    let price, amountToClearAuction, timeUntilAuctionClears
    try {
      const [num, den] = (await dx.getPrice.call(eth.address, gno.address, i)).map(n => n.toNumber())
      console.log(`DENOMINATOR = ${den}, NUMERATOR = ${num}`)
      price = `1 ETH = ${(num / den).toFixed(8)} GNO`

      // if current running auction
      if (i === auctionIndex) {
        /* eslint-disable no-mixed-operators */
        amountToClearAuction = Math.floor(sellVolumeCurrent * num / den) - buyVolume
        const timeWhenAuctionClears = Math.ceil(72000 * sellVolumeCurrent / buyVolume - 18000 + auctionStart)

        timeUntilAuctionClears = getTimeStr((now - timeWhenAuctionClears) * 1000)
      }
    } catch (error) {
      price = 'unavailable, auction hasn\'t started'

      const [num, den] = (await dx.getPrice.call(eth.address, gno.address, i - 1)).map(n => n.toNumber())
      price += `\n  last closingPrice:\t1 ETH = ${(num / den).toFixed(8)} GNO`
    }

    const sellerBalance = (await dx.sellerBalances.call(eth.address, gno.address, i, seller)).toNumber()
    const buyerBalance = (await dx.buyerBalances.call(eth.address, gno.address, i, buyer)).toNumber()
    // const sellerClaimed = (await dx.claimedAmounts(i, seller)).toNumber()
    // const buyerClaimed = (await dx.claimedAmounts(i, buyer)).toNumber()

    if (i !== auctionIndex) {
      console.log('=============================')
      console.log(`Auction index ${i}`)
    }

    console.log(`
      buyVolume:\t\t${buyVolume}
      price:\t\t${price}${amountToClearAuction ? `\n  to clear auction buy\t${amountToClearAuction} GNO` : ''}
      ${timeUntilAuctionClears ? `will clear with time in ${timeUntilAuctionClears}` : ''}

      sellerBalance:  ${sellerBalance}\tclaimed:  ${'SellerClaimed'} ETH
      buyerBalance:   ${buyerBalance}\tclaimed:  ${'buyerClaimed'} GNO
    `)
  }

  for (const i of indexes) {
    await readStats(i)
  }
}
