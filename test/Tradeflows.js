/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */

const PriceOracleInterface = artifacts.require('PriceOracleInterface')

const { 
  eventWatcher,
  logger,
  timestamp,
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  checkBalanceBeforeClaim,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
let oracle
let tokenTUL


let contracts

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    TokenTUL: tokenTUL,
    PriceOracle: oracle,
  } = contracts)
}

contract('DutchExchange', (accounts) => {
  const [, seller1, , buyer1] = accounts

  beforeEach(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  after(eventWatcher.stopWatching)

  it('Flow 6 - Buys tokens at the 3:1 price', async () => {
    eventWatcher(dx, 'NewTokenPair', {})
    
    const auctionIndex = await getAuctionIndex()
    

    // general setup information
    logger('PRICE ORACLE', await PriceOracleInterface.at(oracle.address).getUSDETHPrice.call()) 
    logger('tuliptoken', await tokenTUL.totalTokens())

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    
    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(eth, gno, auctionIndex, (10 ** 9) * 3, buyer1)
    
    /* -- claim Buyerfunds - function does this:
    * 1. balanceBeforeClaim = (await dx.balances.call(eth.address, buyer1)).toNumber()
    * 2. await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
    * 3. assert.equal(balanceBeforeClaim + 10 ** 9 - (await dx.balances.call(eth.address, buyer1)).toNumber() < MaxRoundingError, true)
    */
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, (10 ** 9 - 10 ** 9 / 200), 10000)

    // claim Sellerfunds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 9 * 3 - 10 ** 9 * 3 / 200), 10000)

    // Check that the auction is in the right state after that:
    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
    assert.equal(Math.abs(closingPriceNum - closingPriceDen * 3) < 100000, true)
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionIndex.call(gno.address, eth.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber(), 1)
    assert.equal((await dx.getAuctionStart.call(eth.address, gno.address)).toNumber(), 1)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 0)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)
  })
})


contract('DutchExchange', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2] = accounts

  beforeEach(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracle: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  after(eventWatcher.stopWatching)

  it('Flow 6 + additional SellOrder - process two auctions one after the other in one pair only', async () => {
    let auctionIndex

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)

    // post buyOrder
    auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 3, { from: buyer1 })

    // check Buyer1 balance and claim
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, (10 ** 9 - 10 ** 9 / 200), 100000)

    // claim Sellerfunds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 9 * 3 - 10 ** 9 * 3 / 200), 1000000)

    // post new sell order to start next auction
    auctionIndex = await getAuctionIndex()
    const timeOfNextAuctionStart = timestamp() + 10 * 60
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 ** 9, { from: seller2 })

    auctionIndex = await getAuctionIndex()
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })

    // check conditions in flow
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionIndex.call(gno.address, eth.address)).toNumber(), 2)
    assert.equal(Math.abs((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber() - timeOfNextAuctionStart <= 1), true)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 10 ** 9 - 10 ** 9 / 200)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)
    // TODO add testing for extraToken
  })
})

contract('DutchExchange', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2] = accounts

  beforeEach(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracle: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      10 ** 8 * 5,
      2,
      1,
      { from: seller1 },
    )
  })

  after(eventWatcher.stopWatching)

  it('Flow 1: test a trade on the opposite pair', async () => {
    let auctionIndex

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 ** 9 * 3, buyer1)
    // clearing second auction
    await postBuyOrder(gno, eth, auctionIndex, 10 ** 8 * 5 * 3 / 4, buyer2)
    // claim buyer1 BUYER funds
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, (10 ** 9 - 10 ** 9 / 200), 100000)
    // claim seller2 BUYER funds - RECIPROCAL
    await checkBalanceBeforeClaim(buyer2, auctionIndex, 'buyer', gno, eth, (10 ** 8 * 5 - 10 ** 8 * 5 / 200), 100000)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 9 * 3 - 10 ** 9 * 3 / 200), 100000)
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', gno, eth, (10 ** 8 * 5 * 3 / 4 - 10 ** 8 * 5 * 3 / 4 / 200), 100000)
    

    // check all conditions
    auctionIndex = await getAuctionIndex()
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionIndex.call(gno.address, eth.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber(), 1)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 0)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)


    logger('new auction index:', auctionIndex)
    logger('auctionStartDate', (await dx.getAuctionStart(eth.address, gno.address)).toNumber())
    // post new sell order to start next auction
    // startingTimeOfAuction = await getStartingTimeOfAuction(eth, gno)
    const timeOfNextAuctionStart = timestamp() + 10 * 60
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 ** 7, { from: seller2 })
    

    // check that Flow is process correctly
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 2)
    assert.equal(Math.abs((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber() - timeOfNextAuctionStart <= 1), true)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 10 ** 7 - 10 ** 7 / 200)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)


    // check Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    auctionIndex = await getAuctionIndex()
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })
  })
})

contract('DutchExchange', (accounts) => {
  const [, seller1, , buyer1, buyer2] = accounts

  beforeEach(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracle: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  after(eventWatcher.stopWatching)

  it('Flow 9 - clearing an auction + opposite 0 vol with buyOrder, after it closed theoretical', async () => {
    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    let auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    // non-clearing buyOrder
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.666666)
    await postBuyOrder(eth, gno, auctionIndex, 10 ** 9, buyer1)

    // theoretical clearing at  0.5
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)

    // check that auction is in right place
    auctionIndex = await getAuctionIndex()
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 1)
    assert.equal((await dx.getAuctionIndex.call(gno.address, eth.address)).toNumber(), 1)
    assert.equal((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber(), auctionStart)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 10 ** 9 - 10 ** 9 / 200)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)

    // clearing buyOrder
    const previousBuyVolume = (await dx.buyVolumes(eth.address, gno.address)).toNumber()
    await postBuyOrder(eth, gno, auctionIndex, 10 ** 9, buyer2)

    const [closingPriceNum] = await dx.closingPrices.call(eth.address, gno.address, auctionIndex)
    assert.equal(previousBuyVolume, closingPriceNum)
    const [closingPriceNum2] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
    assert.equal(0, closingPriceNum2)
    // check Buyer1 balance and claim
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, (10 ** 9 - 10 ** 9 / 200))
    // check Seller1 Balance
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 9 - 10 ** 9 / 200))

    // check that auction is in right place
    auctionIndex = await getAuctionIndex()
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionIndex.call(gno.address, eth.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber(), 1)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 0)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)
  })
})
/*
contract('DutchExchange', (accounts) => {
  const [, seller1, , buyer1, buyer2] = accounts

  beforeEach(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracle: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  after(eventWatcher.stopWatching)

  it('Flow 9 - clearing an auction + opposite 0 vol with opposite buyOrder, after it closed theoretical', async () => {
    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    let auctionIndex = await getAuctionIndex()
    let auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    // non-clearing buyOrder
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.666666)
    await postBuyOrder(eth, gno, auctionIndex, 10 ** 9, buyer1)

    //theoretical clearing at  0.5
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)

    //check that auction is in right place
    auctionIndex = await getAuctionIndex()
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 1)
    assert.equal((await dx.getAuctionIndex.call(gno.address, eth.address)).toNumber(), 1)
    assert.equal((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber(), auctionStart)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 10 ** 9 - 10 ** 9 / 200)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)

    // clearing buyOrder with opposite buyOrder
    const previousBuyVolume = (await dx.buyVolumes(eth.address, gno.address)).toNumber()
    await postBuyOrder(gno, eth, auctionIndex, 10 ** 9, buyer2)

    const [closingPriceNum,] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex))
    assert.equal(previousBuyVolume, closingPriceNum)
    const [closingPriceNum2] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
    assert.equal(0, closingPriceNum2)
    // check Buyer1 balance and claim
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, (10 ** 9 - 10 ** 9 / 200))
    // check Seller1 Balance
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 9 - 10 ** 9 / 200))

    //check that auction is in right place
    auctionIndex = await getAuctionIndex()
    assert.equal((await dx.getAuctionIndex.call(eth.address, gno.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionIndex.call(gno.address, eth.address)).toNumber(), 2)
    assert.equal((await dx.getAuctionStart.call(gno.address, eth.address)).toNumber(), 1)
    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), 0)
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0)
  })
})
contract('DutchExchange', (accounts) => {
  const [, seller1, , buyer1] = accounts

  beforeEach(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tokenTUL,
      PriceOracle: oracle,
    } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 8,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  after(eventWatcher.stopWatching)

  it('clearing an 0 sellVolume opposite auction after 6 hours and check shift of NextSellVolume', async () => {
    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)

    const auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.99)
    
    await dx.postSellOrder(eth.address, gno.address, auctionIndex + 1, 10 ** 8, { from: seller1 })
    let nextSellVolume = (await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber()
    assert.equal(nextSellVolume, 10 ** 8 - 10 ** 8 / 200)
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 8, { from: buyer1 })

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)
    const currentSellVolume = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    assert.equal(currentSellVolume, 10 ** 8 - 10 ** 8 / 200)
    logger('current SellVolume', currentSellVolume)

    nextSellVolume = (await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber()
    assert.equal(nextSellVolume, 10 ** 8 - 10 ** 8 / 200, 'sellVolumeNextNotCorrectAfterClearing')
    logger('nextSellVolume', nextSellVolume)
    console.log(nextSellVolume)
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 8, { from: buyer1 })
    assert.equal(nextSellVolume, (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber())
    assert.equal((await dx.sellVolumesNext.call(eth.address, gno.address)).toNumber(), 0, 'sellVOlumeNext is not reseted')

    // check Buyer1 balance and claim
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer', eth, gno, (10 ** 8 - 10 ** 8 / 200))
    // check Seller1 Balance
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 8 - 10 ** 8 / 200))
  })
})
*/
