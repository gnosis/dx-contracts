/*
  eslint prefer-const: 0,
  max-len: 0,
  object-curly-newline: 1,
  no-param-reassign: 0,
  no-console: 0,
  no-mixed-operators: 0,
  no-floating-decimal: 0,
  no-underscore-dangle:0,
  no-return-assign:0,
*/
const bn = require('bignumber.js')
const { wait } = require('@digix/tempo')(web3)
const {
  gasLogWrapper,
  log,
  timestamp,
  varLogger,
} = require('./utils')

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
  'TokenOWL',
  'TokenTUL',
  'PriceOracleInterface',
  'PriceFeed',
  'Medianizer',
  'InternalTests',
]

/**
 * getContracts - async loads contracts and instances
 *
 * @returns { Mapping(contractName => deployedContract) }
 */
const getContracts = async () => {
  const depContracts = contractNames.map(c => artifacts.require(c)).map(cc => cc.deployed())
  const contractInstances = await Promise.all(depContracts)

  const gasLoggedContracts = gasLogWrapper(contractInstances)

  const deployedContracts = contractNames.reduce((acc, name, i) => {
    acc[name] = gasLoggedContracts[i]
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
    startingETH = 50.0.toWei(),
    startingGNO = 50.0.toWei(),
    ethUSDPrice = 1100.0.toWei(),
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

  gnoAcctBalances.slice(1).forEach(bal => assert.equal(bal, startingGNO))
  ethAcctBalances.slice(1).forEach(bal => assert.equal(bal, startingETH))
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

  log(`
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
  let [num, den] = (await dx.getPriceForJS.call(ST.address, BT.address, 1))
  const priceBefore = num.div(den)
  log(`
  Price BEFORE waiting until Price = initial Closing Price (2) * 2
  ==============================
  Price.num             = ${num.toNumber()}
  Price.den             = ${den.toNumber()}
  Price at this moment  = ${(priceBefore)}
  ==============================
  `)
  // wait until the price is good
  await wait(timeToWaitFor - timestamp());
  ([num, den] = (await dx.getPriceForJS.call(ST.address, BT.address, 1)))
  const priceAfter = num.div(den)
  log(`
  Price AFTER waiting until Price = ${p * 100}% of ${priceBefore / 2} (initial Closing Price)
  ==============================
  Price.num             = ${num.toNumber()}
  Price.den             = ${den.toNumber()}
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

  log(`
  Current Auction Index -> ${auctionIdx}
  `)
  const buyVolumes = (await dx.buyVolumes.call(ST.address, BT.address)).toNumber()
  const sellVolumes = (await dx.sellVolumesCurrent.call(ST.address, BT.address)).toNumber()
  log(`
    Current Buy Volume BEFORE Posting => ${buyVolumes.toEth()}
    Current Sell Volume               => ${sellVolumes.toEth()}
    ----
    Posting Buy Amt -------------------> ${amt.toEth()} in GNO for ETH
  `)
  // log('POSTBUYORDER TX RECEIPT ==', await dx.postBuyOrder(ST.address, BT.address, auctionIdx, amt, { from: acct }))
  return dx.postBuyOrder(ST.address, BT.address, auctionIdx, amt, { from: acct })
}

/**
 * postSellOrder
 * @param {address} ST      => Sell Token
 * @param {address} BT      => Buy Token
 * @param {uint}    aucIdx  => auctionIndex
 * @param {uint}    amt     => amount
 *
 * @returns { tx receipt }
 */
const postSellOrder = async (ST, BT, aucIdx, amt, acct) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno
  let auctionIdx = aucIdx || 0

  const buyVolumes = (await dx.buyVolumes.call(ST.address, BT.address)).toNumber()
  const sellVolumes = (await dx.sellVolumesCurrent.call(ST.address, BT.address)).toNumber()
  log(`
    Current Buy Volume BEFORE Posting => ${buyVolumes.toEth()}
    Current Sell Volume               => ${sellVolumes.toEth()}
    ----
    Posting Sell Amt -------------------> ${amt.toEth()} in ${ST} for ${BT} in auction ${auctionIdx}
  `)
  // log('POSTBUYORDER TX RECEIPT ==', await dx.postBuyOrder(ST.address, BT.address, auctionIdx, amt, { from: acct }))
  return dx.postSellOrder(ST.address, BT.address, auctionIdx, amt, { from: acct })
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
  log('AUC IDX = ', auctionIdx)
  return dx.claimBuyerFunds(ST.address, BT.address, user, auctionIdx, { from: user })
}

/**
 * claimSellerFunds
 * @param {address} ST      => Sell Token
 * @param {address} BT      => Buy Token
 * @param {address} user    => user address
 * @param {uint}    aucIdx  => auction Index [@default => getAuctionindex()]
 * @param {address} acct    => signer of tx if diff from user [@default = user]
 *
 * @returns { [uint returned, uint tulipsToIssue] }
 */
const claimSellerFunds = async (ST, BT, user, aucIdx, acct) => {
  const { DutchExchange: dx, EtherToken: eth, TokenGNO: gno } = await getContracts()
  ST = ST || eth; BT = BT || gno; user = user || acct
  let auctionIdx = aucIdx || await getAuctionIndex()
  log('AUC IDX = ', auctionIdx)
  return dx.claimSellerFunds(ST.address, BT.address, user, auctionIdx, { from: user })
}

/**
   * checkUserReceivesTulipTokens
   * @param {address} ST    => Sell Token: token using to buy buyToken (normally ETH)
   * @param {address} BT    => Buy Token: token to buy
   * @param {address} user  => address of current user buying and owning tulips
   */
const checkUserReceivesTulipTokens = async (ST, BT, user, idx) => {
  const {
    DutchExchange: dx, EtherToken: eth, TokenGNO: gno, TokenTUL: tokenTUL,
  } = await getContracts()

  ST = ST || eth; BT = BT || gno

  const aucIdx = idx || await getAuctionIndex()
  const [returned, tulips] = (await dx.claimBuyerFunds.call(ST.address, BT.address, user, aucIdx)).map(amt => amt.toNumber())
  const amtClaimed = (await dx.claimedAmounts.call(ST.address, BT.address, aucIdx, user)).toNumber()
  // set global tulips state
  log(`
    RETURNED          = ${returned.toEth()}           <-- Current amt returned in this fn call
    AMOUNT(S) CLAIMED = ${amtClaimed.toEth()}         < -- THIS + RETURNED = TULIPS

    TULIPS            = ${tulips.toEth()}             <-- Accumulation of returned + claimedAmounts
  `)
  let newBalance = (await dx.balances.call(ST.address, user)).toNumber()
  log(`
    USER'S ETH AMT = ${newBalance.toEth()}
  `)
  const calcAucIdx = await getAuctionIndex()
  if (calcAucIdx === 1) {
    assert.equal(tulips, 0, 'Auction is still running Tulips calculated still 0')
  } else {
    assert.isAtLeast(tulips.toEth(), (returned + amtClaimed).toEth(), 'Auction closed returned tokens should equal tulips minted')
  }

  /*
   * SUB TEST 3: CLAIMBUYERFUNDS - CHECK BUYVOLUMES - CHECK LOCKEDTULIPS AMT = 1:1 FROM AMT IN POSTBUYORDER
   */
  const { receipt: { logs } } = await claimBuyerFunds(ST, BT, false, aucIdx, user)
  log(logs ? '\tCLAIMING FUNDS SUCCESSFUL' : 'CLAIM FUNDS FAILED')
  // log(logs)

  const buyVolumes = (await dx.buyVolumes.call(ST.address, BT.address)).toNumber()
  log(`
    CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
  `)

  // Problem w/consts below is that if the auction has NOT cleared they will always be 0
  const tulFunds = (await tokenTUL.balanceOf.call(user)).toNumber()
  const lockedTulFunds = (await tokenTUL.lockedTULBalances.call(user)).toNumber()
  newBalance = (await dx.balances.call(ST.address, user)).toNumber()
  log(`
    USER'S OWNED TUL AMT  = ${tulFunds.toEth()}
    USER'S LOCKED TUL AMT = ${lockedTulFunds.toEth()}

    USER'S ETH AMT = ${newBalance.toEth()}
  `)
  const refreshedIdx = await getAuctionIndex()
  if (refreshedIdx === 2) {
    assert.equal(tulips.toEth(), lockedTulFunds.toEth(), 'for ETH -> * pair, auction has cleared so returned tokens should equal tulips minted')
  } else if (refreshedIdx === 1) {
    // with changes, TULIPS are NOT minted until auctionCleared
    // lockedTulFunds should = 0
    assert.equal(lockedTulFunds, 0, 'for ETH -> * auction has NOT cleared so there are 0 tulips')
  }
}

/**
 * unlockTulipTokens
 * @param {address} user => address to unlock Tokens for
 */
const unlockTulipTokens = async (user) => {
  const { TokenTUL: tokenTUL } = await getContracts()
  // cache auction index for verification of auciton close
  const aucIdx = await getAuctionIndex()

  // cache locked balances Mapping in TokenTUL contract
  // filled automatically after auction closes and TokenTUL.mintTokens is called
  const lockedBalMap = (await tokenTUL.lockedTULBalances.call(user))
  log(`
  TOKENTUL.lockedTULBalances[user] === ${lockedBalMap.toNumber().toEth()}
  `)

  // cache the locked Amount of user Tulips from TokenTUL MAP
  // this map is ONLY calculated and filled AFTER auction clears
  const lockedUserTulips = (await tokenTUL.lockedTULBalances.call(user)).toNumber()
  /*
   * SUB TEST 1: CHECK UNLOCKED AMT + WITHDRAWAL TIME
   * [should be 0,0 as none LOCKED so naturally none to unlock yet]
   */
  let [unlockedFunds, withdrawTime] = (await tokenTUL.unlockedTULs.call(user)).map(n => n.toNumber())
  log(`
  AMT OF UNLOCKED FUNDS  = ${unlockedFunds.toEth()}
  TIME OF WITHDRAWAL     = ${withdrawTime} [0 means no withdraw time as there are 0 locked tokens]
  `)
  assert.equal(unlockedFunds, 0, 'unlockedFunds should be 0')
  assert.equal(withdrawTime, 0, 'Withdraw time should be 0 ')

  /*
   * SUB TEST 2: LOCK TOKENS
   */
  // lock total tulips in lockedMap
  await tokenTUL.lockTokens(lockedUserTulips, { from: user })
  const totalAmtLocked = (await tokenTUL.lockTokens.call(lockedUserTulips, { from: user })).toNumber()
  log(`
  TOKENS LOCKED          = ${totalAmtLocked.toEth()}
  `)
  if (aucIdx === 2) {
    // auction HAS cleared, TUL should have been minted
    assert.equal(totalAmtLocked, lockedUserTulips, 'Total locked tulips should equal total user balance of tulips')
  } else {
    // auction has NOT cleared, no minting
    assert.equal(totalAmtLocked, 0, 'Total locked tulips should equal total user balance of tulips')
  }

  /*
   * SUB TEST 3: UN-LOCK TOKENS
   */
  await tokenTUL.unlockTokens(lockedUserTulips, { from: user });
  ([unlockedFunds, withdrawTime] = (await tokenTUL.unlockTokens.call(lockedUserTulips, { from: user })).map(t => t.toNumber()))
  log(`
  AMT OF UNLOCKED FUNDS  = ${unlockedFunds.toEth()}
  TIME OF WITHDRAWAL     = ${withdrawTime} --> ${new Date(withdrawTime * 1000)}
  `)
  if (aucIdx === 2) {
    // Auction HAS cleared
    assert.equal(unlockedFunds, lockedUserTulips, 'unlockedFunds should be = lockedUserTulips')
    // assert withdrawTime === now (in seconds) + 24 hours (in seconds)
    assert.equal(withdrawTime, timestamp() + (24 * 3600), 'Withdraw time should be equal to [(24 hours in seconds) + (current Block timestamp in seconds)]')
  } else {
    assert.equal(unlockedFunds, 0, 'unlockedFunds should be = 0 as no tokens minted')
    // assert withdrawTime === now (in seconds) + 24 hours (in seconds)
    assert.equal(withdrawTime, 0, 'Withdraw time should be equal 0 as no Token minted')
  }
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
            if ((await dx.buyerBalances.call(token.address, tokenPartner.address, auctionIndex, acct)).toNumber() > 0) {
              const [w] = (await dx.claimBuyerFunds.call(token.address, tokenPartner.address, acct, auctionIndex))
              balance = balance.add(w)
            }
            if ((await dx.sellerBalances.call(tokenPartner.address, token.address, auctionIndex, acct)).toNumber() > 0) {
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
  claimSellerFunds,
  getAuctionIndex,
  getBalance,
  getContracts,
  postBuyOrder,
  postSellOrder,
  setAndCheckAuctionStarted,
  setupTest,
  unlockTulipTokens,
  wait,
  waitUntilPriceIsXPercentOfPreviousPrice,
  calculateTokensInExchange,
}
