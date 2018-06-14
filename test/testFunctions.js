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
  silent,
  gasLogWrapper,
  log,
  timestamp,
  varLogger
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
  'DutchExchangeProxy',
  'EtherToken',
  'OWLAirdrop',
  'TokenGNO',
  'TokenOWLProxy',
  'TokenFRT',
  'PriceOracleInterface',
  'PriceFeed',
  'Medianizer',
]
// DutchExchange and TokenOWL are added after their respective Proxy contracts are deployed

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
  }, {});

  [deployedContracts.DutchExchange, deployedContracts.TokenOWL] = gasLogWrapper([
    artifacts.require('DutchExchange').at(deployedContracts.DutchExchangeProxy.address),
    artifacts.require('TokenOWL').at(deployedContracts.TokenOWLProxy.address),
  ])
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

  // const gnoAcctBalances = await Promise.all(accounts.map(accts => getBalance(accts, gno)))
  // const ethAcctBalances = await Promise.all(accounts.map(accts => getBalance(accts, eth)))

  // gnoAcctBalances.slice(1).forEach(bal => assert.equal(bal, startingGNO))
  // ethAcctBalances.slice(1).forEach(bal => assert.equal(bal, startingETH))
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
  const [ getAuctionIndex, getAuctionStart ] = await Promise.all([
    dx.getAuctionIndex.call(ST.address, BT.address),
    dx.getAuctionStart.call(ST.address, BT.address)
  ])

  const currentIndex = getAuctionIndex.toNumber()
  const startingTimeOfAuction = getAuctionStart.toNumber()
  let priceBefore = 1
  if (!silent) {
    let [num, den] = (await dx.getCurrentAuctionPrice.call(ST.address, BT.address, currentIndex))
    priceBefore = num.div(den)
    log(`
      Price BEFORE waiting until Price = initial Closing Price (2) * 2
      ==============================
      Price.num             = ${num.toNumber()}
      Price.den             = ${den.toNumber()}
      Price at this moment  = ${(priceBefore)}
      ==============================
    `)
  }

  const timeToWaitFor = Math.ceil((86400 - p * 43200) / (1 + p)) + startingTimeOfAuction
  // wait until the price is good
  await wait(timeToWaitFor - timestamp());

  if (!silent) {
    ([num, den] = (await dx.getCurrentAuctionPrice.call(ST.address, BT.address, currentIndex)))
    const priceAfter = num.div(den)
    log(`
      Price AFTER waiting until Price = ${p * 100}% of ${priceBefore / 2} (initial Closing Price)
      ==============================
      Price.num             = ${num.toNumber()}
      Price.den             = ${den.toNumber()}
      Price at this moment  = ${(priceAfter)}
      ==============================
    `)
  }
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

/**
 * getAuctionIndex
 * @param {addr} Sell Token
 * @param {addr} Buy Token
 */
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
  let auctionIdx = aucIdx || await getAuctionIndex(ST, BT)

  if (!silent) {
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
  }
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

  if (!silent) {
    const buyVolumes = (await dx.buyVolumes.call(ST.address, BT.address)).toNumber()
    const sellVolumes = (await dx.sellVolumesCurrent.call(ST.address, BT.address)).toNumber()
    log(`
      Current Buy Volume BEFORE Posting => ${buyVolumes.toEth()}
      Current Sell Volume               => ${sellVolumes.toEth()}
      ----
      Posting Sell Amt -------------------> ${amt.toEth()} in ${await ST.symbol()} for ${await BT.symbol()} in auction ${auctionIdx}
    `)
  }
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
  let auctionIdx = aucIdx || await getAuctionIndex(ST, BT)
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
  let auctionIdx = aucIdx || await getAuctionIndex(ST, BT)
  log('AUC IDX = ', auctionIdx)
  const [returned, tulipsIssued] = (await dx.claimSellerFunds.call(ST.address, BT.address, user, auctionIdx)).map(n => n.toNumber())
  log(`
  RETURNED    ===> ${returned.toEth()}
  TUL ISSUED  ===> ${tulipsIssued.toEth()}
  `)
  return dx.claimSellerFunds(ST.address, BT.address, user, auctionIdx, { from: user })
}

/**
   * assertClaimingFundsCreatesMGNs
   * @param {address} ST    ==>   Sell Token
   * @param {address} BT    ==>   Buy Token
   * @param {address} acc   ==>   Account
   * @param {string}  type  ==>   Type of Account
   */
const assertClaimingFundsCreatesMGNs = async (ST, BT, acc, type) => {
  const {
    DutchExchange: dx, TokenFRT: tokenMGN,
  } = await getContracts()

  if (!ST || !BT) throw new Error('No tokens passed in')

  let tulipsIssued
  // NOTE: MGNs are NOT minted/issued/etc until Auction has CLEARED
  const auctionIdx = await getAuctionIndex(ST, BT)
  assert.isAtLeast(auctionIdx, 2, 'Auction needs to have cleared - throw otherwise')

  // grab prevTulBalance to compare against new MGNs Issued later
  const prevTulBal = (await tokenMGN.lockedTokenBalances.call(acc)).toNumber()

  if (type === 'seller') {
    ([, tulipsIssued] = (await dx.claimSellerFunds.call(ST.address, BT.address, acc, auctionIdx - 1)).map(n => n.toNumber()))
    await claimSellerFunds(ST, BT, acc, auctionIdx - 1)
  } else {
    ([, tulipsIssued] = (await dx.claimBuyerFunds.call(ST.address, BT.address, acc, auctionIdx - 1)).map(n => n.toNumber()))
    await claimBuyerFunds(ST, BT, acc, auctionIdx - 1)
  }

  const newTulBal = (await tokenMGN.lockedTokenBalances.call(acc)).toNumber()
  log(`
    LockedTulBal === ${newTulBal.toEth()}
    prevTul + tulipsIss = newTulBal
    ${prevTulBal.toEth()} + ${tulipsIssued.toEth()} = ${newTulBal.toEth()}
    `)

  assert.equal(newTulBal, prevTulBal + tulipsIssued)
}

/**
   * checkUserReceivesTulipTokens (deprec)
   * @param {address} ST                => Sell Token: token using to buy buyToken (normally ETH)
   * @param {address} BT                => Buy Token: token to buy
   * @param {address} user              => address of current user buying and owning tulips
   * @param {uint}    lastsClosingPrice => lastClosingPrice of Token Pair
   */
const checkUserReceivesTulipTokens = async (ST, BT, user, idx, lastClosingPrice) => {
  const {
    DutchExchange: dx, EtherToken: eth, TokenGNO: gno, TokenFRT: tokenMGN,
  } = await getContracts()
  ST = ST || eth; BT = BT || gno
  const aucIdx = idx || await getAuctionIndex(ST, BT)

  const BTName = await BT.name.call()
  const STName = await ST.name.call()

  // S1: grab returned an tulips amount BEFORE actually calling
  const [returned, tulips] = (await dx.claimBuyerFunds.call(ST.address, BT.address, user, aucIdx)).map(amt => amt.toNumber())
  let amtClaimed = (await dx.claimedAmounts.call(ST.address, BT.address, aucIdx, user)).toNumber()
  log(`
    ${STName}/${BTName}
    RETURNED          = ${returned.toEth()}           <-- Current amt returned in this fn call
    AMOUNT(S) CLAIMED = ${amtClaimed.toEth()}         < -- THIS + RETURNED = TULIPS

    TULIPS            = ${tulips.toEth()}             <-- Accumulation of returned + claimedAmounts
  `)
  let newBalance = (await dx.balances.call(ST.address, user)).toNumber()
  log(`
    USER'S ${STName} AMT = ${newBalance.toEth()}
  `)
  /*
   * SUB TEST 3: CLAIMBUYERFUNDS - CHECK BUYVOLUMES - CHECK LOCKEDTULIPS AMT = 1:1 FROM AMT IN POSTBUYORDER
   */
  const lockedTulFunds = (await tokenMGN.lockedTokenBalances.call(user)).toNumber()
  const calcAucIdx = await getAuctionIndex(ST, BT)

  log(`CalcAucIdx == ${calcAucIdx}`)

  if (calcAucIdx === 1) {
    assert.equal(tulips, 0, 'Auction is still running MGNs calculated still 0')
    // with changes, TULIPS are NOT minted until auctionCleared
    // lockedTulFunds should = 0
    assert.equal(lockedTulFunds, 0, 'for auctions that have NOT cleared there are 0 tulips')
    return
  }

  // S2: Actually claimBuyerFunds
  const { receipt: { logs } } = await claimBuyerFunds(ST, BT, user, aucIdx)
  log(logs ? '\tCLAIMING FUNDS SUCCESSFUL' : 'CLAIM FUNDS FAILED')
  // amtClaimed = (await dx.claimedAmounts.call(ST.address, BT.address, aucIdx, user)).toNumber()
  // Problem w/consts below is that if the auction has NOT cleared they will always be 0
  const tulFunds = (await tokenMGN.balanceOf.call(user)).toNumber()
  const lastestLockedTulFunds = (await tokenMGN.lockedTokenBalances.call(user)).toNumber()
  newBalance = (await dx.balances.call(ST.address, user)).toNumber()
  log(`
    USER'S OWNED TUL AMT      = ${tulFunds.toEth()}
    USER'S LOCKED TUL AMT     = ${lockedTulFunds.toEth()}
    USER'S LAST CLOSING PRICE = ${lastClosingPrice}
    USER'S ETH AMT            = ${newBalance.toEth()}
  `)

  if (STName === 'Ether Token' || BTName === 'Ether Token') {
    assert.isAtLeast(tulips.toEth(), (returned).toEth(), 'Auction closed returned tokens should equal tulips minted')
  } else {
    log(`
    TULIPS for NON-ETH trade == ${((returned * lastClosingPrice)).toEth()}
    `)
    assert.equal(tulips.toEth(), ((returned * lastClosingPrice)).toEth())
  }
  log(`
  CLAIMED AMTS === ${amtClaimed.toEth()}
  Locked TUL BEFORE CLAIM == ${lockedTulFunds.toEth()}
  Locked TUL AFTER CLAIM == ${lastestLockedTulFunds.toEth()}
  `)
  assert.equal((tulips + lockedTulFunds).toEth(), (lastestLockedTulFunds).toEth(), 'for any Token pair, auction has cleared so returned tokens should equal tulips minted')
}

/**
 * assertReturnedPlusMGNs
 * @param {addr} Sell Token
 * @param {addr} Buy Token
 * @param {addr} Account
 * @param {strg} Type of user >--> seller || buyer
 * @param {numb} Auction Index
 */
const assertReturnedPlusMGNs = async (ST, BT, acc, type, idx = 1, eth) => {
  let returned, tulipsIssued, userBalances
  const [
    { DutchExchange: dx },
    STName,
    BTName
  ] = await Promise.all([
    getContracts(),
    ST.name.call(),
    BT.name.call()
  ])

  // check if current trade is an ETH:ERC20 trade or not
  const nonETH = STName !== 'Ether Token' && BTName !== 'Ether Token'

  // calc closingPrices for both ETH/ERC20 and nonETH trades
  const [num, den] = (await dx.closingPrices.call(ST.address, BT.address, idx)).map(s => s.toNumber())
  const [hNum, hDen] = (await dx.getPriceInPastAuction.call(type === 'seller' ? ST.address : BT.address, eth.address, idx - 1)).map(s => s.toNumber())

  // conditionally check sellerBalances and returned/tulipIssued
  if (type === 'seller') {
    userBalances = (await dx.sellerBalances.call(ST.address, BT.address, idx, acc)).toNumber();
    ([returned, tulipsIssued] = (await dx.claimSellerFunds.call(ST.address, BT.address, acc, idx)).map(s => s.toNumber()))
  } else {
    userBalances = (await dx.buyerBalances.call(ST.address, BT.address, idx, acc)).toNumber();
    ([returned, tulipsIssued] = (await dx.claimBuyerFunds.call(ST.address, BT.address, acc, idx)).map(s => s.toNumber()))
  }

  log(`
  ${type === 'seller' ? '==SELLER==' : '==BUYER== '}
  [${STName}]//[${BTName}]
  ${type === 'seller' ? 'sellerBalance' : 'buyerBalance '}      == ${userBalances.toEth()}
  lastClosingPrice    == ${type === 'seller' ? (num / den) : (den / num)}
  lastHistoricalPrice == ${hNum / hDen}
  PriceToUse          == ${type === 'seller' && !nonETH ? (num / den) : type === 'seller' && nonETH ? (hNum / hDen) : type === 'buyer' && !nonETH ? (den / num) : (hNum / hDen)}
  RETURNED tokens     == ${returned.toEth()}
  TULIP tokens        == ${tulipsIssued.toEth()}
  `)

  // ASSERTIONS
  // Seller
  if (type === 'seller') {
    if (!nonETH) {
      if (STName === 'Ether Token') {
        assert.equal(tulipsIssued, userBalances)
      } else {
        assert.equal(tulipsIssued, returned)
      }
    // else this is a ERC20:ERC20 trade
    } else {
      assert.equal(tulipsIssued, userBalances * hNum / hDen)
    }
    // all claimSellFunds calc returned the same
    assert.equal(returned, userBalances * (num / den))
  // Buyer
  } else if (!nonETH) {
    if (BTName === 'Ether Token') {
      assert.equal(tulipsIssued, userBalances, 'claimBuyerFunds: BT = ETH >--> tulips = buyerBalances')
    } else {
      assert.isAtLeast(userBalances * (den / num), tulipsIssued, 'claimBuyerFunds: ST = ETH >--> tulips = buyerBalances * (den/num)')
    }
  // Trade involves ERC20:ERC20 pair
  } else {
    assert.equal(tulipsIssued, userBalances * (hNum / hDen), 'claimBuyerFunds: ERC20:ERC20 tulips = buyerBalances * (hNum/hDen)')
  }
}

/**
 * unlockTulipTokens
 * @param {address} user => address to unlock Tokens for
 */
const unlockMGNTokens = async (user, ST, BT) => {
  const { TokenFRT: tokenMGN } = await getContracts()
  // cache auction index for verification of auciton close
  const aucIdx = await getAuctionIndex(ST, BT)

  // cache locked balances Mapping in TokenFRT contract
  // filled automatically after auction closes and TokenFRT.mintTokens is called
  const lockedBalMap = (await tokenMGN.lockedTokenBalances.call(user))
  log(`
  TOKENTUL.lockedTokenBalances[user] === ${lockedBalMap.toNumber().toEth()}
  `)

  // cache the locked Amount of user MGNs from TokenFRT MAP
  // this map is ONLY calculated and filled AFTER auction clears
  const lockedUserMGNs = (await tokenMGN.lockedTokenBalances.call(user)).toNumber()
  /*
   * SUB TEST 1: CHECK UNLOCKED AMT + WITHDRAWAL TIME
   * [should be 0,0 as none LOCKED so naturally none to unlock yet]
   */
  let [unlockedFunds, withdrawTime] = (await tokenMGN.unlockedTokens.call(user)).map(n => n.toNumber())
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
  await tokenMGN.lockTokens(lockedUserMGNs, { from: user })
  const totalAmtLocked = (await tokenMGN.lockTokens.call(lockedUserMGNs, { from: user })).toNumber()
  log(`
  TOKENS LOCKED          = ${totalAmtLocked.toEth()}
  `)
  if (aucIdx === 2) {
    // auction HAS cleared, TUL should have been minted
    assert.equal(totalAmtLocked, lockedUserMGNs, 'Total locked tulips should equal total user balance of tulips')
  } else {
    // auction has NOT cleared, no minting
    assert.equal(totalAmtLocked, 0, 'Total locked tulips should equal total user balance of tulips')
  }

  /*
   * SUB TEST 3: UN-LOCK TOKENS
   */
  await tokenMGN.unlockTokens(lockedUserMGNs, { from: user });
  ([unlockedFunds, withdrawTime] = (await tokenMGN.unlockTokens.call(lockedUserMGNs, { from: user })).map(t => t.toNumber()))
  log(`
  AMT OF UNLOCKED FUNDS  = ${unlockedFunds.toEth()}
  TIME OF WITHDRAWAL     = ${withdrawTime} --> ${new Date(withdrawTime * 1000)}
  `)
  if (aucIdx === 2) {
    // Auction HAS cleared
    assert.equal(unlockedFunds, lockedUserMGNs, 'unlockedFunds should be = lockedUserMGNs')
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
        const [
          getBuyVolumes,
          getSellVolumesCurrent,
          getSellVolumesNext,
          getExtraTokens,
          getExtraTokens1,
          getExtraTokens2
        ] = await Promise.all([
          dx.buyVolumes.call(tokenPartner.address, token.address),
          dx.sellVolumesCurrent.call(token.address, tokenPartner.address),
          dx.sellVolumesNext.call(token.address, tokenPartner.address),
          dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex),
          dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex + 1),
          dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex + 2)
        ])
        // check current auction balances
        balance = balance.add(getBuyVolumes)
        balance = balance.add(getSellVolumesCurrent)

        // check next auction balances
        balance = balance.add(getSellVolumesNext)
        balance = balance.add(getExtraTokens)
        balance = balance.add(getExtraTokens1)
        balance = balance.add(getExtraTokens2)
        // logger('extraTokens',(await dx.extraTokens.call(token.address, tokenPartner.address, lastAuctionIndex)).toNumber())
      }
    }
    results.push(balance)
  }
  return results
}

module.exports = {
  assertClaimingFundsCreatesMGNs,
  assertReturnedPlusMGNs,
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
  unlockMGNTokens,
  wait,
  waitUntilPriceIsXPercentOfPreviousPrice,
  calculateTokensInExchange,
}
