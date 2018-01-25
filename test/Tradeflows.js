/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */

// const PriceOracleInterface = artifacts.require('PriceOracleInterface')

const { 
  eventWatcher,
  logger,
  timestamp,
  gasLogger,
  enableContractFlag,
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  checkBalanceBeforeClaim,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
  calculateTokensInExchange,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
let oracle
let tokenTUL
let balanceInvariant
const ether = 10 ** 18

let contracts

const valMinusFee = amount => amount - (amount / 200)

const checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
  assert.equal((await dx.getAuctionIndex.call(ST.address, BT.address)).toNumber(), auctionIndex, 'auction Index not correct')
  assert.equal((await dx.getAuctionIndex.call(BT.address, ST.address)).toNumber(), auctionIndex)
  let difference = Math.abs((await dx.getAuctionStart.call(ST.address, BT.address)).toNumber() - auctionStart)
  assert.isAtMost(difference, 2, 'time difference bigger than 1 sec')
  assert.equal((await dx.sellVolumesCurrent.call(ST.address, BT.address)).toNumber(), sellVolumesCurrent, ' current SellVolume not correct')
  assert.equal((await dx.sellVolumesNext.call(ST.address, BT.address)).toNumber(), sellVolumesNext, 'sellVOlumeNext is incorrect')
  difference = Math.abs((await dx.buyVolumes.call(ST.address, BT.address)).toNumber() - buyVolumes)
  logger('buyVolumes', buyVolumes)
  logger((await dx.buyVolumes.call(ST.address, BT.address)).toNumber())
  assert.isAtMost(difference, MaxRoundingError, 'buyVolumes incorrect') 
  const [closingPriceNumReal, closingPriceDenReal] = await dx.closingPrices.call(ST.address, BT.address, auctionIndex)
  logger('ClosingPriceNumReal', closingPriceNumReal)
  difference = Math.abs(closingPriceNumReal - closingPriceNum)
  assert.isAtMost(difference, MaxRoundingError, 'ClosingPriceNum not okay') 
  assert.equal(closingPriceDenReal, closingPriceDen, 'ClosingPriceDen not okay')
}

const checkInvariants = async (invariant, accounts, tokens, allowedRoundingErrors = 1) => {
  const newBalanceInvariant = await calculateTokensInExchange(accounts, tokens)
  logger('invariant before', invariant.map(v => v.toNumber()))
  logger('invariant after', newBalanceInvariant.map(v => v.toNumber()))
  for (let i = 0; i < tokens.length; i += 1) {
    assert.isAtMost(balanceInvariant[i].minus(newBalanceInvariant[i]).abs(), allowedRoundingErrors, `issue with Token${i}`)
  }
}

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    TokenTUL: tokenTUL,
    PriceOracleInterface: oracle,
  } = contracts)
}
const startBal = {
  startingETH: 90.0.toWei(),
  startingGNO: 90.0.toWei(),
  ethUSDPrice: 1008.0.toWei(),
  sellingAmount: 50.0.toWei(), // Same as web3.toWei(50, 'ether')
}


const c1 = () => contract('DutchExchange - Flow 3', (accounts) => {
  const [, seller1, , buyer1] = accounts

  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * ether,
      0,
      2,
      1,
      { from: seller1 },
    )

    eventWatcher(dx, 'Log', {})
  })

  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  it('step 1 - Buys tokens at the 3:1 price and clears both auctions', async () => {
    const auctionIndex = await getAuctionIndex()
    
    // general setup information
    logger('PRICE ORACLE', await oracle.getUSDETHPrice.call()) 
    logger('tuliptoken', await tokenTUL.totalTokens.call())

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(eth, gno, auctionIndex, (10 * ether) * 3, buyer1)
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 100000)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('step 2 - checks claimings and final price', async () => {
    const auctionIndex = 1 
    /* -- claim Buyerfunds - function does this:
    * 1. balanceBeforeClaim = (await dx.balances.call(eth.address, buyer1)).toNumber()
    * 2. await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
    * 3. assert.equal(balanceBeforeClaim + 10 ** 9 - (await dx.balances.call(eth.address, buyer1)).toNumber() < MaxRoundingError, true)
    */
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, valMinusFee(10 * ether), 100000)

    // claim Sellerfunds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, valMinusFee(10 * ether * 3), 10 ** 17)

    // check prices:  - actually reduantant with tests postBuyOrder
    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
    assert.equal(closingPriceNum.minus(closingPriceDen.mul(3)).abs().toNumber() < 10 ** 17, true)
  })
})

const c2 = () => contract('DutchExchange - Flow 6', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2] = accounts

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracleInterface: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * ether,
      0,
      2,
      1,
      { from: seller1 },
    )
  })
  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  it('step 1 - Buys tokens at the 3:1 price and clears both auctions', async () => {
    eventWatcher(dx, 'NewTokenPair', {})
    
    const auctionIndex = await getAuctionIndex()
    

    // general setup information
    logger('PRICE ORACLE', await oracle.getUSDETHPrice.call()) 
    logger('tuliptoken', await tokenTUL.totalTokens.call())

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    
    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(eth, gno, auctionIndex, (10 * ether) * 3, buyer1)
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 100000)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('step 2 - checks claimings and final price', async () => {
    const auctionIndex = 1 
    /* -- claim Buyerfunds - function does this:
    * 1. balanceBeforeClaim = (await dx.balances.call(eth.address, buyer1)).toNumber()
    * 2. await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
    * 3. assert.equal(balanceBeforeClaim + 10 ** 9 - (await dx.balances.call(eth.address, buyer1)).toNumber() < MaxRoundingError, true)
    */
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, valMinusFee(10 * ether), 100000)

    // claim Sellerfunds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, valMinusFee(10 * ether * 3), 10 ** 16)

    // check prices:  - actually reduantant with tests postBuyOrder
    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
    assert.equal(Math.abs(closingPriceNum - closingPriceDen * 3) < 10 ** 16, true)
  })

  it('step 3 - restarting the auction', async () => {
    // post new sell order to start next auction
    let auctionIndex = await getAuctionIndex()
    const timeOfNextAuctionStart = timestamp() + 10 * 60
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 * ether, { from: seller2 })

    auctionIndex = await getAuctionIndex()
    
    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 * ether * 2, { from: buyer2 })

    // check conditions in flow
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, timeOfNextAuctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 2), 0, 0, eth, gno, 100000)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
    // TODO testing for extra tokens
  })
})

const c3 = () => contract('DutchExchange - Flow 4', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2, seller3] = accounts

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracleInterface: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * ether,
      ether * 5,
      2,
      1,
      { from: seller1 },
    )
  })

  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  it('step 1 - clearing one auction', async () => {
    const auctionIndex = await getAuctionIndex()

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 3), valMinusFee(10 * ether) * 3, valMinusFee(10 * ether), eth, gno, 10 ** 16)
  })

  it('step 1 - ensuring immediate restart of next auctions', async () => { 
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await dx.postSellOrder(eth.address, gno.address, auctionIndex + 1, 10 * ether, { from: seller2 })
    await dx.postSellOrder(eth.address, gno.address, 0, 10 * ether, { from: seller2 })
    await dx.postSellOrder(gno.address, eth.address, 0, 10 * ether, { from: seller3 })
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), valMinusFee(10 * ether * 2), valMinusFee(10 * ether) * 3, valMinusFee(10 * ether) * 3, valMinusFee(10 * ether), eth, gno, 10 ** 16)
  })

  it('step 2 - clearing second auction', async () => { 
    const auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(gno, eth, 1.0)
    // clearing second auction
    const timeOfNextAuctionStart = timestamp() + 10 * 60
    logger('current sell volume', (await dx.sellVolumesCurrent.call(gno.address, eth.address)).toNumber())
    await postBuyOrder(gno, eth, auctionIndex, 10 ** 18 * 5 / 2, buyer2)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, timeOfNextAuctionStart, valMinusFee(10 * ether * 2), 0, 0, 0, 0, eth, gno, 100000)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })  
  it('step 3 - just claiming', async () => {
    const auctionIndex = 1 
    // claim buyer1 BUYER funds
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, valMinusFee(10 * ether), 1)
    // claim seller2 BUYER funds - RECIPROCAL
    await checkBalanceBeforeClaim(buyer2, auctionIndex, 'buyer', gno, eth, valMinusFee(ether * 5), 1)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, valMinusFee(10 * ether * 3), 10 ** 16)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', gno, eth, valMinusFee(ether * 5 / 2), 10 ** 16)
  })

   
  it('step 3 - restarting auction', async () => {
    let auctionIndex = await getAuctionIndex()  

    logger('new auction index:', auctionIndex)
    logger('auctionStartDate', (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber())
    // post new sell order to start next auction
    // startingTimeOfAuction = await getStartingTimeOfAuction(eth, gno)
    const timeOfNextAuctionStart = timestamp() + 10 * 60
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 * ether, { from: seller2 })
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, timeOfNextAuctionStart, valMinusFee(10 * ether) * 3, 0, 0, 0, 0, eth, gno, 0)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])

    // check Auction has started and accepts further buyOrders
    await setAndCheckAuctionStarted(eth, gno)
    auctionIndex = await getAuctionIndex()
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })
  })
})

const c4 = () => contract('DutchExchange - Flow 1', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2] = accounts

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracleInterface: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * ether,
      ether * 5,
      2,
      1,
      { from: seller1 },
    )
  })

  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  it('step 1 - clearing one auction', async () => {
    const auctionIndex = await getAuctionIndex()

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 3), valMinusFee(10 * ether) * 3, valMinusFee(10 * ether), eth, gno, 10 ** 16)
  })

  it('step 2 - clearing second auction', async () => { 
    const auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(gno, eth, 1.0)
    // clearing second auction
    logger('current sell volume', (await dx.sellVolumesCurrent.call(gno.address, eth.address)).toNumber())
    await postBuyOrder(gno, eth, auctionIndex, 10 ** 18 * 5 / 2, buyer2)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 100000)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })   

  it('step 3 - just claiming', async () => {
    const auctionIndex = 1 
    // claim buyer1 BUYER funds
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, valMinusFee(10 * ether), 1)
    // claim seller2 BUYER funds - RECIPROCAL
    await checkBalanceBeforeClaim(buyer2, auctionIndex, 'buyer', gno, eth, valMinusFee(ether * 5), 1)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, valMinusFee(10 * ether * 3), 10 ** 16)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', gno, eth, valMinusFee(ether * 5 / 2), 10 ** 16)
  })
   
  it('step 3 - restarting auction', async () => {
    let auctionIndex = await getAuctionIndex()  

    logger('new auction index:', auctionIndex)
    logger('auctionStartDate', (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber())
    // post new sell order to start next auction
    // startingTimeOfAuction = await getStartingTimeOfAuction(eth, gno)
    const timeOfNextAuctionStart = timestamp() + 10 * 60
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 * ether, { from: seller2 })
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, timeOfNextAuctionStart, valMinusFee(10 * ether) * 1, 0, 0, 0, 0, eth, gno, 0)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])

    // check Auction has started and accepts further buyOrders
    await setAndCheckAuctionStarted(eth, gno)
    auctionIndex = await getAuctionIndex()
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })
  })
})

const c5 = () => contract('DutchExchange - Flow 9', (accounts) => {
  const [, seller1, , buyer1, buyer2] = accounts

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracleInterface: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * ether,
      0,
      2,
      1,
      { from: seller1 },
    )
  })
  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  it('step 2 - closing theoretical', async () => {
    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    let auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
    // non-clearing buyOrder
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether, buyer1)

    // theoretical clearing at  0.5
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)

    // check that auction is in right place
    auctionIndex = await getAuctionIndex()

    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether), 0, 0, eth, gno, 0)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('step 3 - both auctions get cleared', async () => {
    let auctionIndex = await getAuctionIndex()
    // clearing buyOrder
    const previousBuyVolume = (await dx.buyVolumes.call(eth.address, gno.address)).toNumber()
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether, buyer2)

    // check correct closing prices
    const [closingPriceNum] = await dx.closingPrices.call(eth.address, gno.address, auctionIndex)
    assert.equal(previousBuyVolume, closingPriceNum)
    const [closingPriceNum2] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
    assert.equal(0, closingPriceNum2)
    // check Buyer1 balance and claim
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, valMinusFee(10 * ether))
    // check Seller1 Balance
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, valMinusFee(10 * ether))

    // check that auction is in right place
    auctionIndex = await getAuctionIndex()

    // const checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, eth, gno, 0)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
    // await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c6 = () => contract('DutchExchange - Flow 10', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2] = accounts

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracleInterface: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * ether,
      ether * 5,
      2,
      1,
      { from: seller1 },
    )
  })
  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  it('step 2 - clearing one auction theoretical', async () => {
    const auctionIndex = await getAuctionIndex()

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 2, buyer1)

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 2), 0, 0, eth, gno, 10 ** 16)
  })

  it('step 2 - clearing one auction', async () => {
    const auctionIndex = await getAuctionIndex()

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 2), valMinusFee(10 * ether) * 2, valMinusFee(10 * ether), eth, gno, 10 ** 16)
  })

  it('step 3 - clearing second auction', async () => { 
    const auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(gno, eth, 1.0)
    // clearing second auction
    logger('current sell volume', (await dx.sellVolumesCurrent.call(gno.address, eth.address)).toNumber())
    await postBuyOrder(gno, eth, auctionIndex, 10 ** 18 * 5 / 2, buyer2)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 100000)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })   

  it('step 4 - just claiming', async () => {
    const auctionIndex = 1 
    // claim buyer1 BUYER funds
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, valMinusFee(10 * ether), 1)
    // claim seller2 BUYER funds - RECIPROCAL
    await checkBalanceBeforeClaim(buyer2, auctionIndex, 'buyer', gno, eth, valMinusFee(ether * 5), 1)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, valMinusFee(10 * ether * 2), 10 ** 16)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', gno, eth, valMinusFee(ether * 5 / 2), 10 ** 16)
  })
   
  it('step 5 - restarting auction', async () => {
    let auctionIndex = await getAuctionIndex()  

    logger('new auction index:', auctionIndex)
    logger('auctionStartDate', (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber())
    // post new sell order to start next auction
    // startingTimeOfAuction = await getStartingTimeOfAuction(eth, gno)
    const timeOfNextAuctionStart = timestamp() + 10 * 60
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 * ether, { from: seller2 })
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, timeOfNextAuctionStart, valMinusFee(10 * ether) * 1, 0, 0, 0, 0, eth, gno, 0)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])

    // check Auction has started and accepts further buyOrders
    await setAndCheckAuctionStarted(eth, gno)
    auctionIndex = await getAuctionIndex()
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })
  })
})

const c7 = () => contract('DutchExchange - Flow 7', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2, seller3] = accounts

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracleInterface: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * ether,
      ether * 5,
      2,
      1,
      { from: seller1 },
    )
  })
  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  it('step 1 - clearing one auction theoretical', async () => {
    const auctionIndex = await getAuctionIndex()

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 2, buyer1)

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 2), 0, 0, eth, gno, 10 ** 16)
  })

  it('step 2 - clearing one auction', async () => {
    const auctionIndex = await getAuctionIndex()

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 2), valMinusFee(10 * ether) * 2, valMinusFee(10 * ether), eth, gno, 10 ** 16)
  })

  it('step 2 - ensuring immediate restart of next auctions', async () => { 
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await dx.postSellOrder(eth.address, gno.address, auctionIndex + 1, 10 * ether, { from: seller2 })
    await dx.postSellOrder(eth.address, gno.address, 0, 10 * ether, { from: seller2 })
    await dx.postSellOrder(gno.address, eth.address, 0, 10 * ether, { from: seller3 })
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), valMinusFee(10 * ether * 2), valMinusFee(10 * ether) * 2, valMinusFee(10 * ether) * 2, valMinusFee(10 * ether), eth, gno, 10 ** 16)
  })

  it('step 3 - clearing second auction', async () => { 
    const auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(gno, eth, 1.0)
    // clearing second auction
    const timeOfNextAuctionStart = timestamp() + 60 * 10 
    logger('current sell volume', (await dx.sellVolumesCurrent.call(gno.address, eth.address)).toNumber())
    await postBuyOrder(gno, eth, auctionIndex, 10 ** 18 * 5 / 2, buyer2)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, timeOfNextAuctionStart, valMinusFee(10 * ether * 2), 0, 0, 0, 0, eth, gno, 100000)
    await checkState(2, timeOfNextAuctionStart, valMinusFee(10 * ether), 0, 0, 0, 0, gno, eth, 100000)
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })   

  it('step 4 - just claiming', async () => {
    const auctionIndex = 1 
    // claim buyer1 BUYER funds
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, valMinusFee(10 * ether), 1)
    // claim seller2 BUYER funds - RECIPROCAL
    await checkBalanceBeforeClaim(buyer2, auctionIndex, 'buyer', gno, eth, valMinusFee(ether * 5), 1)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, valMinusFee(10 * ether * 2), 10 ** 16)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', gno, eth, valMinusFee(ether * 5 / 2), 10 ** 16)
  })
})

enableContractFlag(c1, c2, c3, c4, c5, c6, c7)
