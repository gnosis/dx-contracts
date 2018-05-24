/* eslint no-console:0 */
const { deployed, getExchangeStatsForTokenPair, getAuctionStatsForTokenPair } = require('./utils/contracts')(artifacts)
const { getTime, increaseTimeBy, setTime } = require('./utils')(web3)

const argv = require('minimist')(process.argv.slice(2))

const getTimeStr = (timestamp) => {
  const date = new Date(Math.abs(timestamp))
  const hh = date.getUTCHours()
  const mm = date.getUTCMinutes()
  const ss = date.getUTCSeconds()

  return `${hh ? `${hh} hour(s) ` : ''}${mm ? `${mm} minute(s) ` : ''}${ss ? `${ss} second(s) ` : ''}`
}

const getSeconds = ({ h = 0, m = 0, s = 0 }) => (h * 60 * 60) + (m * 60) + s

const getNumDenStr = ([num, den]) => `${num}/${den} = ${(num / den).toFixed(8)}`

/**
 * truffle exec test/trufflescripts/increase_timer.js
 * increases auction time
 * @flags:
 * --start      first, sets time to auction start
 * --clear      or auction end,
 * then increases time by
 * -h <number>    given hours
 * -m <number>    given minutes
 * -s <number>    given seconds
 */

module.exports = async () => {
  const { eth, gno } = await deployed

  const printAuctionTimes = async () => {
    const now = getTime()
    const {
      auctionStart,
      latestAuctionIndex,
      sellTokenOraclePrice,
      buyTokenOraclePrice,
    } = await getExchangeStatsForTokenPair({ sellToken: eth, buyToken: gno })

    // const timeUntilStart = auctionStart - now
    // const timeStr = getTimeStr(timeUntilStart * 1000)


    console.log(`
    Auction index ${latestAuctionIndex}
    ______________________________________
    now:\t\t\t${new Date(now * 1000).toTimeString()}
    auctionStart:\t\t\t${new Date(auctionStart * 1000).toTimeString()}
    `)

    if (auctionStart === 0) {
      console.log('auction has never run before')
    } else {
      const timeUntilStart = auctionStart - now
      const timeStr = getTimeStr(timeUntilStart * 1000)

      if (timeUntilStart > 0) {
        console.log(`next auction starts in\t\t${timeStr}`)
      } else if (timeUntilStart < 0) {
        console.log(`auction started\t\t${timeStr}ago`)
      } else {
        console.log('auction just started')
      }
    }

    const {
      price,
      sellVolume,
      buyVolume,
    } = await getAuctionStatsForTokenPair({ sellToken: eth, buyToken: gno, index: latestAuctionIndex })

    let timeWhenAuctionClears

    if (price && sellTokenOraclePrice && buyTokenOraclePrice) {
      const [num, den] = price

      const amountToClearAuction = Math.floor((sellVolume * num) / den) - buyVolume
      console.log(`\n  currentPrice: 1 ETH = ${getNumDenStr(price)} GNO`)

      if (amountToClearAuction > 0) console.log(`  to clear auction buy\t${amountToClearAuction} GNO`)

      timeWhenAuctionClears = 86400 + auctionStart

      if (auctionStart === 1 || auctionStart > now) {
        console.log('  auction haven\t started yet')
      } else if (now < timeWhenAuctionClears) {
        const timeUntilAuctionClears = getTimeStr((now - timeWhenAuctionClears) * 1000)
        console.log(`  will clear with time in ${timeUntilAuctionClears}`)
      }
    }

    return { auctionStart, timeWhenAuctionClears }
  }

  const { auctionStart, timeWhenAuctionClears } = await printAuctionTimes()

  const incTimeBy = getSeconds(argv)

  console.log(`Setting time to ${argv.start ? 'AUCTION_START' : argv.clear ? 'AUCTION_END' : ''} ${incTimeBy ? `+ ${getTimeStr(incTimeBy * 1000)}` : ''}`)

  if (argv.start) {
    setTime(auctionStart, incTimeBy)
  } else if (argv.clear && timeWhenAuctionClears !== undefined && timeWhenAuctionClears !== Infinity) {
    setTime(timeWhenAuctionClears, incTimeBy)
  }

  if (incTimeBy) {
    increaseTimeBy(incTimeBy)
  }

  console.log('==========================')

  await printAuctionTimes()
}
