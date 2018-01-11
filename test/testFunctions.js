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
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  const startingTimeOfAuction = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()
  const timeToWaitFor = Math.ceil((86400 - p * 43200) / (1 + p)) + startingTimeOfAuction
  // wait until the price is good
  await wait(timeToWaitFor - timestamp())
  const [num, den] = (await dx.getPriceForJS(eth.address, gno.address, 1)).map(n => n.toNumber())
  console.log(num, den, 'Price at this moment === ', num / den)
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
  Current Auction Index -> ${auctionIdx}
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

/**
   * postBuyOrder_And_CheckUserReceivesTulipTokens
   * @param {*} user - address of current user buying and owning tulips
   * @param {*} ST  - token using to buy buyToken (normally ETH)
   * @param {*} BT - token to buy
   */
const checkUserReceivesTulipTokens = async (user, ST, BT) => {
  const {
    DutchExchange: dx, EtherToken: eth, TokenGNO: gno, TokenTUL: tokenTUL,
  } = await getContracts()
  ST = ST || eth; BT = BT || gno

  const aucIdx = await getAuctionIndex()
  const [returned, tulips] = (await dx.claimBuyerFunds.call(ST.address, BT.address, user, aucIdx)).map(amt => amt.toNumber())
  // set global tulips state
  console.log(`
    RETURNED  = ${returned}
    TULIPS    = ${tulips}
  `)
  assert.equal(returned, tulips, 'for ETH -> * pair returned tokens should equal tulips minted')

  /*
     * SUB TEST 3: CLAIMBUYERFUNDS - CHECK BUYVOLUMES - CHECK LOCKEDTULIPS AMT = 1:1 FROM AMT IN POSTBUYORDER
     */
  const { receipt: { logs } } = await claimBuyerFunds(ST, BT, false, false, user)
  console.log(logs ? '\tCLAIMING FUNDS SUCCESSFUL' : 'CLAIM FUNDS FAILED')
  console.log(logs)

  const buyVolumes = (await dx.buyVolumes.call(ST.address, BT.address)).toNumber()
  console.log(`
    CURRENT ETH//GNO bVolume = ${buyVolumes}
  `)

  const tulFunds = (await tokenTUL.balanceOf.call(user)).toNumber()
  const lockedTulFunds = (await tokenTUL.getLockedAmount.call(user)).toNumber()
  // set global state
  // userTulips = lockedTulFunds
  const newBalance = (await dx.balances.call(ST.address, user)).toNumber()
  console.log(`
    USER'S OWNED TUL AMT = ${tulFunds}
    USER'S LOCKED TUL AMT = ${lockedTulFunds}

    USER'S ETH AMT = ${newBalance}
  `)
  // due to passage of time(stamp)
  assert.isAtLeast(lockedTulFunds, tulips, 'final tulip tokens are slightly > than calculated from dx.claimBuyerFunds.call')
  assert.isAtLeast(newBalance, lockedTulFunds, 'for ETH -> * pair returned tokens should equal tulips minted')
}

const unlockTulipTokens = async (user) => {
  const { TokenTUL: tokenTUL } = await getContracts()

  const userTulips = (await tokenTUL.getLockedAmount.call(user)).toNumber()
  /*
   * SUB TEST 1: CHECK UNLOCKED AMT + WITHDRAWAL TIME
   * [should be 0,0 as none unlocked yet]
   */
  let [unlockedFunds, withdrawTime] = (await tokenTUL.unlockedTULs.call(user)).map(n => n.toNumber())
  console.log(`
  AMT OF UNLOCKED FUNDS  = ${unlockedFunds}
  TIME OF WITHDRAWAL     = ${withdrawTime} [0 means no withdraw time as there are 0 locked tokens]
  `)
  assert.equal(unlockedFunds, 0, 'unlockedFunds should be 0')
  assert.equal(withdrawTime, 0, 'Withdraw time should be 0 ')

  /*
   * SUB TEST 2: LOCK TOKENS
   */
  // lock tokens - arbitarily high amt to force Math.min
  await tokenTUL.lockTokens(userTulips, { from: user })
  const totalAmtLocked = (await tokenTUL.lockTokens.call(userTulips, { from: user })).toNumber()
  console.log(`
  TOKENS LOCKED           = ${totalAmtLocked}
  `)
  assert.equal(totalAmtLocked, userTulips, 'Total locked tulips should equal total user balance of tulips')

  /*
   * SUB TEST 3: UN-LOCK TOKENS
   */
  await tokenTUL.unlockTokens(userTulips, { from: user });
  ([unlockedFunds, withdrawTime] = (await tokenTUL.unlockTokens.call(userTulips, { from: user })).map(t => t.toNumber()))
  console.log(`
  AMT OF UNLOCKED FUNDS  = ${unlockedFunds}
  TIME OF WITHDRAWAL     = ${withdrawTime} --> ${new Date(withdrawTime * 1000)}
  `)
  assert.equal(unlockedFunds, userTulips, 'unlockedFunds should be = userTulips')
  // assert withdrawTime === now (in seconds) + 24 hours (in seconds)
  assert.equal(withdrawTime, timestamp() + (24 * 3600), 'Withdraw time should be equal to [(24 hours in seconds) + (current Block timestamp in seconds)]')
}

module.exports = {
  checkBalanceBeforeClaim,
  checkUserReceivesTulipTokens,
  claimBuyerFunds,
  getAuctionIndex,
  getContracts,
  postBuyOrder,
  setAndCheckAuctionStarted,
  setupTest,
  unlockTulipTokens,
  waitUntilPriceIsXPercentOfPreviousPrice,
}
