/* eslint prefer-const:0, max-len:0, object-curly-newline:1, no-param-reassign:0, no-console:0, no-mixed-operators:0 */
const { wait } = require('@digix/tempo')(web3)
const { timestamp, varLogger } = require('./utils')

const MaxRoundingError = 100

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
const setupTest = async (accounts, {
  DutchExchange: dx, EtherToken: eth, TokenGNO: gno, PriceOracle: oracle,
}) => {
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

  const startingTimeOfAuction = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()

  // wait for the right time to send buyOrder

  await wait((startingTimeOfAuction - timestamp()) + 500)

  console.log(`
  time now ----------> ${new Date(timestamp() * 1000)}
  auction starts ----> ${new Date(startingTimeOfAuction * 1000)}
  `)

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
  const startingTimeOfAuction = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()
  const timeToWaitFor = Math.ceil((86400 - p * 43200) / (1 + p)) + startingTimeOfAuction
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

  let token = sellToken
  if (claiming === 'seller') {
    token = buyToken
  }

  const balanceBeforeClaim = (await dx.balances.call(token.address, acct)).toNumber()

  if (claiming === 'buyer') {
    await dx.claimBuyerFunds(sellToken.address, buyToken.address, acct, idx)
  } else {
    await dx.claimSellerFunds(sellToken.address, buyToken.address, acct, idx)
  }

  const balanceAfterClaim = (await dx.balances.call(token.address, acct)).toNumber()
  const difference = Math.abs(balanceBeforeClaim + amt - balanceAfterClaim)
  varLogger('claiming for', claiming)
  varLogger('balanceBeforeClaim', balanceBeforeClaim)
  varLogger('amount', amt)
  varLogger('balanceAfterClaim', balanceAfterClaim)
  varLogger('difference', difference)
  assert.equal(difference < round, true)
}

const getAuctionIndex = async (sell, buy) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  sell = sell || eth; buy = buy || gno

  return (await dx.getAuctionIndex.call(buy.address, sell.address)).toNumber()
}
// const getStartingTimeOfAuction = async (sell = eth, buy = gno) => (await dx.getAuctionStart.call(sell.address, buy.address)).toNumber()

/**
 * address sellToken,
 * address buyToken,
 * uint auctionIndex,
 * uint amount
 */
const postBuyOrder = async (ST, BT, aucIdx, amt, acct) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno
  let auctionIdx = aucIdx || await getAuctionIndex()

  console.log(`
  Posting Buy Amt -------> ${amt} in ETH for GNO
  `)

  return dx.postBuyOrder(ST.address, BT.address, auctionIdx, amt, { from: acct })
}

const claimBuyerFunds = async (ST, BT, user, aucIdx, acct) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno; user = user || acct
  let auctionIdx = aucIdx || await getAuctionIndex()

  return dx.claimBuyerFunds(ST.address, BT.address, user, auctionIdx, { from: acct })
}

module.exports = {
  checkBalanceBeforeClaim,
  claimBuyerFunds,
  getAuctionIndex,
  getContracts,
  postBuyOrder,
  setAndCheckAuctionStarted,
  setupTest,
  waitUntilPriceIsXPercentOfPreviousPrice,
}
