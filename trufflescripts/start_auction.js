/* eslint no-console:0 */
const DutchExchange = artifacts.require('DutchExchange')
const TokenETH = artifacts.require('EtherToken')
const TokenGNO = artifacts.require('TokenGNO')
// const TokenTUL = artifacts.require('StandardToken')
// const TokenOWL = artifacts.require('OWL')

const { getTime, increaseTimeBy } = require('./utils')(web3)
const argv = require('minimist')(process.argv.slice(4), { string: 'a' })

/**
 * truffle exec trufflescripts/start_auction.js
 * give tokens from master
 * @flags:
 * sellToken          || 'eth'
 * buyToken           || 'gno'
 * sellAmount         ||  500
 * buyAmount          ||  500
 * -a <address>       to the given address
 * --seller           to seller
 * --buyer            to buyer
 */

/**
 * truffle exec trufflescripts/start_auction.js
 * if auction isn't running,
 * sets time to auction start + 1 hour
 */

const hour = 3600

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
  // const tul = await TokenTUL.deployed()
  // const owl = await TokenOWL.deployed()

  let account
  if (argv.a) account = argv.a
  else if (argv.buyer) {
    [, , account] = web3.eth.accounts
  } else {
    // set Seller as default account
    [, account] = web3.eth.accounts
  }

  // Modify argv if necessary
  const sellToken = argv._[0] === 'eth' ? eth : argv._[0] === 'gno' ? gno : eth
  const buyToken = argv._[1] === 'gno' ? gno : argv._[1] === 'eth' ? eth : gno

  console.log(`
    ------------------------------------
    REQUESTED AUCTION START: ${await sellToken.symbol.call()} // ${await buyToken.symbol.call()}
    ------------------------------------
  `)

  // Grab Deposited Token Balances in Auction (if any)
  const balances = acct => Promise.all([
    dx.balances(eth.address, acct),
    dx.balances(gno.address, acct),
  ]).then(res => res.map(bal => bal.toNumber()))

  const [ethBalance, gnoBalance] = await balances(account)
  console.log(`
    --> DX Ether Balance = ${ethBalance}
    --> DX GNO Balance   = ${gnoBalance}
  `)

  try {
    await sellToken.approve.call(dx.address, 10000, { from: account })
    await buyToken.approve.call(dx.address, 10000, { from: account })
    
    console.log(`
    --> Approved sellToken + buyToken movement by DX
    `)
    
    await dx.addTokenPair.call(
      sellToken.address,
      buyToken.address,
      (argv._[2] || 500),
      (argv._[3] || 500),
      2,
      1,
      { from: account },
    )
  } catch (e) {
    console.log(`
    ERROR
    ---------------------------  
    ${e}
    ---------------------------
    `)
  }

  const auctionStart = (await dx.auctionStarts.call(sellToken.address, buyToken.address)).toNumber()
  const now = getTime()
  const timeUntilStart = auctionStart - now

  const auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()

  // auctionStart is in the future
  if (timeUntilStart > 0) {
    increaseTimeBy(timeUntilStart + hour)
    console.log(`ETH -> GNO auction ${auctionIndex} started`)
  } else {
    console.log(`ETH -> GNO auction ${auctionIndex} is already running`)
  }
}
