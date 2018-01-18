/*
  eslint prefer-const: 0,
  max-len: 0,
  object-curly-newline: 1,
  no-param-reassign: 0,
  no-console: 0,
  no-mixed-operators: 0,
  no-floating-decimal: 0,
*/
const bn = require('bignumber.js')
const { wait } = require('@digix/tempo')(web3)
const { timestamp, varLogger } = require('./utils')

// I know, it's gross
// add wei converter
/* eslint no-extend-native: 0 */

Number.prototype.toWei = function toWei() {
  return bn(this, 10).times(10 ** 18).toNumber()
}
Number.prototype.toEth = function toEth() {
  return bn(this, 10).div(10 ** 18).toNumber()
}

const MaxRoundingError = 100

const contractNames = [
  'DutchExchange',
  'EtherToken',
  'TokenGNO',
  'TokenTUL',
  'PriceOracleInterface',
  'PriceFeed',
  'Medianizer',
]

/**
 * getContracts - async loads contracts and instances
 *
 * @returns { Mapping(contractName => deployedContract) }
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
 * getBalance of Acct and Tokens
 * @param {address} acct
 * @param {address} token
 */
const getBalance = async (acct, token) => {
  const { DutchExchange: dx } = await getContracts()
  return (await dx.balances.call(token.address, acct)).toNumber()
}

/**
 * >setupTest()
 * @param {Array[address]} accounts         => ganache-cli accounts passed in globally
 * @param {Object}         contract         => Contract object obtained via: const contract = await getContracts() (see above)
 * @param {Object}         number Amounts   => { ethAmount = amt to deposit and approve, gnoAmount = for gno, ethUSDPrice = eth price in USD }
 */
const setupTest = async (
  accounts,
  {
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    PriceFeed: oracle,
    Medianizer: medianizer,
  },
  {
    startingETH = 50..toWei(),
    startingGNO = 50..toWei(),
    ethUSDPrice = (1008..toWei()),
  }) => {
  // Await ALL Promises for each account setup
  await Promise.all(accounts.map((acct) => {
    /* eslint array-callback-return:0 */
    if (acct === accounts[0]) return

    eth.deposit({ from: acct, value: startingETH })
    eth.approve(dx.address, startingETH, { from: acct })
    gno.transfer(acct, startingGNO, { from: accounts[0] })
    gno.approve(dx.address, startingGNO, { from: acct })
  }))
  // Deposit depends on ABOVE finishing first... so run here
  await Promise.all(accounts.map((acct) => {
    if (acct === accounts[0]) return

    dx.deposit(eth.address, startingETH, { from: acct })
    dx.deposit(gno.address, startingGNO, { from: acct })
  }))
  // add token Pair
  // updating the oracle Price. Needs to be changed later to another mechanism
  await oracle.post(ethUSDPrice, 1516168838 * 2, medianizer.address, { from: accounts[0] })

  const gnoAcctBalances = await Promise.all(accounts.map(accts => getBalance(accts, gno)))
  const ethAcctBalances = await Promise.all(accounts.map(accts => getBalance(accts, eth)))

  gnoAcctBalances.forEach((bal, i) => {
    if (i === 0) return
    assert.equal(bal, startingGNO)
  })

  ethAcctBalances.forEach((bal, i) => {
    if (i === 0) return
    assert.equal(bal, startingETH)
  })
}

// testing Auction Functions
/**
 * setAndCheckAuctionStarted - gets Auction Idx for curr Token Pair and moves time to auction start if: start = false
 * @param {address} ST - Sell Token
 * @param {address} BT - Buy Token
 */
const setAndCheckAuctionStarted = async (ST, BT) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno

  const startingTimeOfAuction = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()

  // wait for the right time to send buyOrder
  // implements isAtLeastZero (aka will not go BACK in time)
  await wait((startingTimeOfAuction - timestamp()))

  console.log(`
  time now ----------> ${new Date(timestamp() * 1000)}
  auction starts ----> ${new Date(startingTimeOfAuction * 1000)}
  `)

  assert.equal(timestamp() >= startingTimeOfAuction, true)
}

/**
 * waitUntilPriceIsXPercentOfPreviousPrice
 * @param {address} ST  => Sell Token
 * @param {address} BT  => Buy Token
 * @param {unit}    p   => percentage of the previous price
 */
const waitUntilPriceIsXPercentOfPreviousPrice = async (ST, BT, p) => {
  const { DutchExchange: dx } = await getContracts()
  const startingTimeOfAuction = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()
  const timeToWaitFor = Math.ceil((86400 - p * 43200) / (1 + p)) + startingTimeOfAuction
  let [num, den] = (await dx.getPriceForJS(ST.address, BT.address, 1))// .map(n => n.toNumber())
  const priceBefore = (num.div(den))// .toFixed(18)
  console.log(`
  Price BEFORE waiting until Price = initial Closing Price (2) * 2
  ==============================
  Price.num             = ${num}
  Price.den             = ${den}
  Price at this moment  = ${(priceBefore)}
  ==============================
  `)
  // wait until the price is good
  await wait(timeToWaitFor - timestamp());
  [num, den] = (await dx.getPriceForJS(ST.address, BT.address, 1))// .map(n => n.toNumber()))
  const priceAfter = (num.div(den))// .toFixed(18)
  console.log(`
  Price AFTER waiting until Price = ${p * 100}% of ${priceBefore / 2} (initial Closing Price)
  ==============================
  Price.num             = ${num}
  Price.den             = ${den}
  Price at this moment  = ${(priceAfter)}
  ==============================
  `)
  assert.equal(timestamp() >= timeToWaitFor, true)
  // assert.isAtLeast(priceAfter, (priceBefore / 2) * p)
}

/**
 * checkBalanceBeforeClaim
 * @param {string} acct       => acct to check Balance of
 * @param {number} idx        => auctionIndex to check
 * @param {string} claiming   => 'seller' || 'buyer'
 * @param {address} ST        => Sell Token
 * @param {address} BT        => Buy Token
 * @param {number} amt        => amt to check
 * @param {number} round      => rounding error threshold
 */
const checkBalanceBeforeClaim = async (
  acct,
  idx,
  claiming,
  ST,
  BT,
  amt = (10 ** 9),
  round = (MaxRoundingError),
) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno

  let token = ST
  if (claiming === 'seller') {
    token = BT
  }

  const balanceBeforeClaim = (await dx.balances.call(token.address, acct))

  if (claiming === 'buyer') {
    await dx.claimBuyerFunds(ST.address, BT.address, acct, idx)
  } else {
    await dx.claimSellerFunds(ST.address, BT.address, acct, idx)
  }

  const balanceAfterClaim = (await dx.balances.call(token.address, acct))
  const difference = balanceBeforeClaim.add(amt).minus(balanceAfterClaim).abs()
  varLogger('claiming for', claiming)
  varLogger('balanceBeforeClaim', balanceBeforeClaim.toNumber())
  varLogger('amount', amt)
  varLogger('balanceAfterClaim', balanceAfterClaim.toNumber())
  varLogger('difference', difference.toNumber())
  assert.equal(difference.toNumber() < round, true)
}

const getAuctionIndex = async (sell, buy) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  sell = sell || eth; buy = buy || gno

  return (await dx.getAuctionIndex.call(buy.address, sell.address)).toNumber()
}

// const getStartingTimeOfAuction = async (sell = eth, buy = gno) => (await dx.getAuctionStart.call(sell.address, buy.address)).toNumber()

/**
 * postBuyOrder
 * @param {address} ST      => Sell Token
 * @param {address} BT      => Buy Token
 * @param {uint}    aucIdx  => auctionIndex
 * @param {uint}    amt     => amount
 *
 * @returns { tx receipt }
 */
const postBuyOrder = async (ST, BT, aucIdx, amt, acct) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno
  let auctionIdx = aucIdx || await getAuctionIndex()

  console.log(`
  Current Auction Index -> ${auctionIdx}
  Posting Buy Amt -------> ${amt.toEth()} in GNO for ETH
  `)

  // TODO David wants to correc this
  // const currentSellVolume = (await dx.sellVolumesCurrent[ST.address][BT.address]).toNumber()
  // const currentBuyVolume = (await dx.sellVolumesCurrent[ST.address][BT.address]).toNumber()
  // const [priceNum, priceDen] = (await dx.getPriceForJS(ST.address, BT.address))
  // const outstandingVolume = currentSellVolume - currentBuyVolume * priceNum / priceDen

  // Post buyOrder
  await dx.postBuyOrder(ST.address, BT.address, auctionIdx, amt, { from: acct })

  // TODO David wants to correc this
  // if (outstandingVolume <= amt) {
  //   assert.equal(currentBuyVolume + outstandingVolume, (await dx.closingPrice(ST.address, BT.address)))
  //   assert.equal((await dx.buyVolumes(ST.address, BT.address)).toNumber(), 0)
  // } else {
  //   assert.equal(0, 0)
  // }
}

/**
 * claimBuyerFunds
 * @param {address} ST      => Sell Token
 * @param {address} BT      => Buy Token
 * @param {address} user    => user address
 * @param {uint}    aucIdx  => auction Index [@default => getAuctionindex()]
 * @param {address} acct    => signer of tx if diff from user [@default = user]
 *
 * @returns { [uint returned, uint tulipsToIssue] }
 */
const claimBuyerFunds = async (ST, BT, user, aucIdx, acct) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno; user = user || acct
  let auctionIdx = aucIdx || await getAuctionIndex()

  return dx.claimBuyerFunds(ST.address, BT.address, user, auctionIdx, { from: user })
}

/**
   * checkUserReceivesTulipTokens
   * @param {address} ST    => Sell Token: token using to buy buyToken (normally ETH)
   * @param {address} BT    => Buy Token: token to buy
   * @param {address} user  => address of current user buying and owning tulips
   */
const checkUserReceivesTulipTokens = async (ST, BT, user) => {
  const {
    DutchExchange: dx, EtherToken: eth, TokenGNO: gno, TokenTUL: tokenTUL,
  } = await getContracts()

  ST = ST || eth; BT = BT || gno

  const aucIdx = await getAuctionIndex()
  const [returned, tulips] = (await dx.claimBuyerFunds.call(ST.address, BT.address, user, aucIdx)).map(amt => amt.toNumber())
  // set global tulips state
  console.log(`
    RETURNED  = ${returned.toEth()}
    TULIPS    = ${tulips.toEth()}
  `)
  assert.equal(returned, tulips, 'for ETH -> * pair returned tokens should equal tulips minted')

  /*
     * SUB TEST 3: CLAIMBUYERFUNDS - CHECK BUYVOLUMES - CHECK LOCKEDTULIPS AMT = 1:1 FROM AMT IN POSTBUYORDER
     */
  const { receipt: { logs } } = await claimBuyerFunds(ST, BT, false, false, user)
  console.log(logs ? '\tCLAIMING FUNDS SUCCESSFUL' : 'CLAIM FUNDS FAILED')
  // console.log(logs)

  const buyVolumes = (await dx.buyVolumes.call(ST.address, BT.address)).toNumber()
  console.log(`
    CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
  `)

  const tulFunds = (await tokenTUL.balanceOf.call(user)).toNumber()
  const lockedTulFunds = (await tokenTUL.getLockedAmount.call(user)).toNumber()
  // set global state
  // userTulips = lockedTulFunds
  const newBalance = (await dx.balances.call(ST.address, user)).toNumber()
  console.log(`
    USER'S OWNED TUL AMT  = ${tulFunds.toEth()}
    USER'S LOCKED TUL AMT = ${lockedTulFunds.toEth()}

    USER'S ETH AMT = ${newBalance.toEth()}
  `)
  // with changes, TULIPS are NOT minted until auctionCleared
  // lockedTulFunds should = 0
  assert.isAtLeast(lockedTulFunds, 0, 'final tulip tokens are slightly > than calculated from dx.claimBuyerFunds.call')
  assert.isAtLeast(newBalance, lockedTulFunds, 'for ETH -> * pair returned tokens should equal tulips minted')
}

/**
 * unlockTulipTokens
 * @param {address} user => address to unlock Tokens for
 */
const unlockTulipTokens = async (user) => {
  const { TokenTUL: tokenTUL } = await getContracts()

  const userTulips = (await tokenTUL.getLockedAmount.call(user)).toNumber()
  /*
   * SUB TEST 1: CHECK UNLOCKED AMT + WITHDRAWAL TIME
   * [should be 0,0 as none unlocked yet]
   */
  let [unlockedFunds, withdrawTime] = (await tokenTUL.unlockedTULs.call(user)).map(n => n.toNumber())
  console.log(`
  AMT OF UNLOCKED FUNDS  = ${unlockedFunds.toEth()}
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
  TOKENS LOCKED           = ${totalAmtLocked.toEth()}
  `)
  assert.equal(totalAmtLocked, userTulips, 'Total locked tulips should equal total user balance of tulips')

  /*
   * SUB TEST 3: UN-LOCK TOKENS
   */
  await tokenTUL.unlockTokens(userTulips, { from: user });
  ([unlockedFunds, withdrawTime] = (await tokenTUL.unlockTokens.call(userTulips, { from: user })).map(t => t.toNumber()))
  console.log(`
  AMT OF UNLOCKED FUNDS  = ${unlockedFunds.toEth()}
  TIME OF WITHDRAWAL     = ${withdrawTime} --> ${new Date(withdrawTime * 1000)}
  `)
  assert.equal(unlockedFunds, userTulips, 'unlockedFunds should be = userTulips')
  // assert withdrawTime === now (in seconds) + 24 hours (in seconds)
  assert.equal(withdrawTime, timestamp() + (24 * 3600), 'Withdraw time should be equal to [(24 hours in seconds) + (current Block timestamp in seconds)]')
}
/**
 * calculateTokensInExchange - calculates the tokens held by the exchange
 * @param {address} token => address to unlock Tokens for
 */
const calculateTokensInExchange = async (Accounts, Tokens) => {
  let results = []
  const { DutchExchange: dx } = await getContracts()
  for (let token of Tokens) {
    // add all normal balances
    let balance = bn(0)
    for (let acct of Accounts) {
      balance = balance.add((await dx.balances.call(token.address, acct)))
    }

    // check balances in each trading pair token<->tokenToTradeAgainst
    // check through all auctions

    for (let tokenPartner of Tokens) {
      if (token.address !== tokenPartner.address) {
        let lastAuctionIndex = (await dx.getAuctionIndex.call(token.address, tokenPartner.address)).toNumber()
        // check old auctions balances
        for (let auctionIndex = 1; auctionIndex < lastAuctionIndex; auctionIndex += 1) {
          for (let acct of Accounts) {
            if ((await dx.buyerBalances(token.address, tokenPartner.address, auctionIndex, acct)).toNumber() > 0) {
              const [w] = (await dx.claimBuyerFunds.call(token.address, tokenPartner.address, acct, auctionIndex))
              balance = balance.add(w)
            }
            if ((await dx.sellerBalances(tokenPartner.address, token.address, auctionIndex, acct)).toNumber() > 0) {
              const [w] = await dx.claimSellerFunds.call(tokenPartner.address, token.address, acct, auctionIndex)
              balance = balance.add(w)
            }
          }
        }
        // check current auction balances
        balance = balance.add((await dx.buyVolumes.call(tokenPartner.address, token.address)))
        balance = balance.add((await dx.sellVolumesCurrent.call(token.address, tokenPartner.address)))

        // check next auction balances
        balance = balance.add((await dx.sellVolumesNext.call(token.address, tokenPartner.address)))
        balance = balance.add((await dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex)))
        balance = balance.add((await dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex + 1)))
        balance = balance.add((await dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex + 2)))
        // logger('extraTokens',(await dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex)).toNumber())
      }
    }
    results.push(balance)
  }
  return results
}

module.exports = {
  checkBalanceBeforeClaim,
  checkUserReceivesTulipTokens,
  claimBuyerFunds,
  getAuctionIndex,
  getBalance,
  getContracts,
  postBuyOrder,
  setAndCheckAuctionStarted,
  setupTest,
  unlockTulipTokens,
  waitUntilPriceIsXPercentOfPreviousPrice,
  calculateTokensInExchange,
}
