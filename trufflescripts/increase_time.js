const DutchExchangeETHGNO = artifacts.require('./DutchExchangeETHGNO.sol')
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

/**
 * truffle exec trufflescripts/increase_timer.js
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
  const dx = await DutchExchangeETHGNO.deployed()

  const printAuctionTimes = async () => {
    const auctionStart = (await dx.auctionStart()).toNumber()
    const now = getTime()

    const timeUntilStart = auctionStart - now
    const timeStr = getTimeStr(timeUntilStart * 1000)

    const auctionIndex = (await dx.auctionIndex()).toNumber()

    console.log(`
  Current auction index ${auctionIndex}
    ______________________________________
    now:\t\t\t${new Date(now * 1000).toTimeString()}
    auctionStart:\t\t${new Date(auctionStart * 1000).toTimeString()}
    ${timeUntilStart > 0 ? `starts in\t\t${timeStr}` : timeUntilStart < 0 ? `started\t\t${timeStr}ago` : 'just started'}
  
    `)

    let timeWhenAuctionClears

    if (timeUntilStart <= 0) {
      const buyVolume = (await dx.buyVolumes(auctionIndex)).toNumber()
      const sellVolume = (await dx.sellVolumeCurrent()).toNumber()

      // Auction clears when sellVolume * price = buyVolume
      // eslint-disable-next-line no-mixed-operators
      timeWhenAuctionClears = Math.ceil(72000 * sellVolume / buyVolume - 18000 + auctionStart)
      if (timeWhenAuctionClears !== Infinity) {
        const timeUntilAuctionClears = now - timeWhenAuctionClears
        console.log(`will clear with time in ${getTimeStr(timeUntilAuctionClears * 1000)}`)
      }
    }

    return { auctionStart, timeWhenAuctionClears }
  }

  const { auctionStart, timeWhenAuctionClears } = await printAuctionTimes()

  const incTimeBy = getSeconds(argv)

  console.log(`Setting time to ${argv.start ? 'AUCTION_START' : argv.clear ? 'AUCTION_END' : ''} ${incTimeBy ? `+ ${getTimeStr(incTimeBy * 1000)}` : ''}`)

  if (argv.start) {
    setTime(auctionStart)
  } else if (argv.clear && timeWhenAuctionClears !== Infinity) {
    setTime(timeWhenAuctionClears)
  }

  if (incTimeBy) {
    increaseTimeBy(incTimeBy)
  }

  console.log('==========================')

  await printAuctionTimes()
}
