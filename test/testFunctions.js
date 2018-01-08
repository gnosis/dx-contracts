/* eslint prefer-const:0, max-len:0, object-curly-newline:1, no-param-reassign:0, no-console:0 */
const { wait } = require('@digix/tempo')(web3)
const { timestamp } = require('./utils')

const MaxRoundingError = 100000

const contractNames = [
  'DutchExchange',
  'EtherToken',
  'TokenGNO',
  'TokenTUL',
  'PriceOracle',
]

/**
 * >getContract()
 * deploys all contracts in build/contracts
 */
const getContracts = async () => {
  const depContracts = contractNames.map(c => artifacts.require(c)).map(cc => cc.deployed())
  const contractInstances = await Promise.all(depContracts)

  const deployedContracts = contractNames.reduce((acc, name, i) => {
    acc[name] = contractInstances[i]
    return acc
  }, {})

  return deployedContracts
}

/**
 * >setupTest()
 * @param {Array}  = accounts passed in globally
 * @param {Object} = Contract object obtained via: const contract = await getContracts() (see above)
 */
const setupTest = async (accounts, { DutchExchange: dx, EtherToken: eth, TokenGNO: gno, PriceOracle: oracle }) => {
  // Await ALL Promises for each account setup
  await Promise.all(accounts.map((acct) => {
    /* eslint array-callback-return:0 */
    if (acct === accounts[0]) return

    eth.deposit({ from: acct, value: 10 ** 9 })
    eth.approve(dx.address, 10 ** 9, { from: acct })
    gno.transfer(acct, 10 ** 18, { from: accounts[0] })
    gno.approve(dx.address, 10 ** 18, { from: acct })
  }))
  // Deposit depends on ABOVE finishing first... so run here
  await Promise.all(accounts.map((acct) => {
    if (acct === accounts[0]) return

    dx.deposit(eth.address, 10 ** 9, { from: acct })
    dx.deposit(gno.address, 10 ** 18, { from: acct })
  }))
  // add token Pair
  // updating the oracle Price. Needs to be changed later to another mechanism
  await oracle.updateETHUSDPrice(60000, { from: accounts[0] })
}

// testing Auction Functions

const setAndCheckAuctionStarted = async (ST, BT) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno

  const startingTimeOfAuction = (await dx.auctionStarts.call(ST.address, BT.address)).toNumber()

  // wait for the right time to send buyOrder

  await wait(startingTimeOfAuction - timestamp())
  assert.equal(timestamp() >= startingTimeOfAuction, true)
}

/**
 * waitUntilPriceIsXPercentOfPreviousPrice
 * @param {*} ST  - sellToken
 * @param {*} BT  - buyToken
 * @param {*} p   - percentage of the previous price
 */
const waitUntilPriceIsXPercentOfPreviousPrice = async (ST, BT, p) => {
  const { DutchExchange: dx } = await getContracts()
  const startingTimeOfAuction = (await dx.auctionStarts.call(ST.address, BT.address)).toNumber()
  const timeToWaitFor = (86400 - p * 43200) / (1 + p) + startingTimeOfAuction
  // wait until the price is good
  await wait(timeToWaitFor - timestamp())
  assert.equal(timestamp() >= timeToWaitFor, true)
}

/**
 * checkBalanceBeforeClaim
 * @param {string} acct       => acct to check Balance of
 * @param {number} idx        => auctionIndex to check
 * @param {string} claiming   => 'seller' || 'buyer'
 * @param {string} sellToken  => gno || eth
 * @param {string} buyToken   => gno || eth
 * @param {number} amt        => amt to check
 * @param {number} round      => rounding error threshold
 */
const checkBalanceBeforeClaim = async (
  acct,
  idx,
  claiming,
  sellToken,
  buyToken,
  amt = (10 ** 9),
  round = MaxRoundingError,
) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  sellToken = sellToken || eth; buyToken = buyToken || gno

  if (claiming === 'buyer') {
    // const auctionIndex = await getAuctionIndex()
    const balanceBeforeClaim = (await dx.balances.call(sellToken.address, acct)).toNumber()
    await dx.claimBuyerFunds(sellToken.address, buyToken.address, acct, idx)
    console.log(`${balanceBeforeClaim}-->${amt}-->-->${(await dx.balances.call(sellToken.address, acct)).toNumber()}`)
    assert.equal(Math.abs(balanceBeforeClaim + amt - (await dx.balances.call(sellToken.address, acct)).toNumber()) < round, true)
  } else {
    const balanceBeforeClaim = (await dx.balances.call(buyToken.address, acct)).toNumber()
    await dx.claimSellerFunds(sellToken.address, buyToken.address, acct, idx)
    console.log(`${balanceBeforeClaim}-->${amt}-->-->${(await dx.balances.call(buyToken.address, acct)).toNumber()}`)
    assert.equal(Math.abs(balanceBeforeClaim + amt - (await dx.balances.call(buyToken.address, acct)).toNumber()) < round, true)
  }
}

const getAuctionIndex = async (sell, buy) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  sell = sell || eth; buy = buy || gno

  return (await dx.getAuctionIndex.call(buy.address, sell.address)).toNumber()
}
// const getStartingTimeOfAuction = async (sell = eth, buy = gno) => (await dx.auctionStarts.call(sell.address, buy.address)).toNumber()

module.exports = {
  setupTest,
  getContracts,
  getAuctionIndex,
  checkBalanceBeforeClaim,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
}

// const setupTest2 = async (accounts) => {
//   // get buyers, sellers set up and running
//   gno = await TokenGNO.deployed()
//   eth = await EtherToken.deployed()
//   tokenTUL = await TokenTUL.deployed() 
//   // create dx
//   dx = await DutchExchange.deployed()
//   // create price Oracle
//   oracle = await PriceOracle.deployed()

//   // Await ALL Promises for each account setup
//   await Promise.all(accounts.map((acct) => {
//     /* eslint array-callback-return:0 */
//     if (acct === accounts[0]) return

//     eth.deposit({ from: acct, value: 10 ** 9 })
//     eth.approve(dx.address, 10 ** 9, { from: acct })
//     gno.transfer(acct, 10 ** 18, { from: accounts[0] })
//     gno.approve(dx.address, 10 ** 18, { from: acct })
//   }))
//   // Deposit depends on ABOVE finishing first... so run here
//   await Promise.all(accounts.map((acct) => {
//     if (acct === accounts[0]) return

//     dx.deposit(eth.address, 10 ** 9, { from: acct })
//     dx.deposit(gno.address, 10 ** 18, { from: acct })
//   }))
//   // add token Pair
//   // updating the oracle Price. Needs to be changed later to another mechanism
//   await oracle.updateETHUSDPrice(60000, { from: accounts[0] })
// }
