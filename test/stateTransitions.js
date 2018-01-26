// This file tests all the states and their interaction as outlined here: https://drive.google.com/drive/folders/0ByHhiGx-ltJZczhjZHhHeGpHcHM

/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */

// const PriceOracleInterface = artifacts.require('PriceOracleInterface')

const { 
  eventWatcher,
  logger,
  timestamp,
  assertRejects,
  gasLogger,
  enableContractFlag,
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
  postSellOrder,
  calculateTokensInExchange,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
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

const getState = async (ST, BT) => { // eslint-disable-line
  const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
  if (auctionStart === 1) { return 5 }
  const auctionIndex = await getAuctionIndex()
  let numP
  let denP
  let numPP
  let denPP // eslint-disable-line
  let numBasedOnVolume
  let denBasedOnVolume
  // calculate state of Auction
  [numP, denP] = (await dx.getPriceForJS.call(ST.address, BT.address, auctionIndex)) // eslint-disable-line
  numBasedOnVolume = await dx.buyVolumes.call(ST.address, BT.address)
  denBasedOnVolume = await dx.sellVolumesCurrent.call(ST.address, BT.address)
  const isAuctionTheoreticalClosed = (numP.mul(denBasedOnVolume).sub(numBasedOnVolume.mul(denP)).toNumber() === 0);
  [numPP, denPP] = (await dx.closingPrices.call(ST.address, BT.address, auctionIndex))
  const isAuctionClosed = (numPP.toNumber() > 0)

  // calculate state of OppAuction
  let numP2
  let denP2
  [numP2, denP2] = (await dx.getPriceForJS.call(BT.address, ST.address, auctionIndex)) // eslint-disable-line
  numBasedOnVolume = await dx.buyVolumes.call(BT.address, ST.address) 
  denBasedOnVolume = await dx.sellVolumesCurrent.call(BT.address, ST.address)
  const isOppAuctionTheoreticalClosed = (numP2.mul(denBasedOnVolume).minus(numBasedOnVolume.mul(denP2)).toNumber() === 0);
  [numPP, denPP] = (await dx.closingPrices.call(BT.address, ST.address, auctionIndex))
  const isOppAuctionClosed = (numPP.toNumber() > 0)
  
  const sellVol = (await dx.sellVolumesCurrent.call(ST.address, BT.address)).toNumber() 
  const sellOppVol = (await dx.sellVolumesCurrent.call(BT.address, ST.address)).toNumber()
  
  // calculating final state
  // check for state S1 and S4
  if (sellVol === 0 || sellOppVol === 0) {
    if (sellVol === 0 && isOppAuctionTheoreticalClosed) { return 7 }
    if (sellOppVol === 0 && isAuctionTheoreticalClosed) { return 7 }
    return 1
  }

  if (isOppAuctionTheoreticalClosed && isAuctionTheoreticalClosed && !isOppAuctionClosed && !isAuctionClosed) { return 4 }
  // check for state 2 and 6
  if (isOppAuctionClosed || isAuctionClosed) {
    if (isAuctionClosed && !isOppAuctionTheoreticalClosed) {
      return 2
    }
    if (isAuctionClosed && isOppAuctionTheoreticalClosed) {
      return 6
    }
    if (isOppAuctionClosed && !isAuctionTheoreticalClosed) {
      return 2
    }
    if (isOppAuctionClosed && isAuctionTheoreticalClosed) {
      return 6
    }
  }

  if (isOppAuctionTheoreticalClosed || isAuctionTheoreticalClosed) {
    return 3
  }

  // only state 0 is left
  return 0
}

const getIntoState = async (state, accounts, ST, BT) => {
  const [seller1, buyer1] = accounts
  switch (state) {
    case 0:
    {
      // allow the start of an auction w/no threshold
      await dx.addTokenPair(
        ST.address,
        BT.address,
        10 * ether,
        5 * ether,
        2,
        1,
        { from: seller1 },
      )

      assert.equal(0, await getState(eth, gno))
      break
    }
    case 1:
    {
      // allow the start of an auction w/no threshold
      await dx.addTokenPair(
        ST.address,
        BT.address,
        10 * ether,
        0,
        2,
        1,
        { from: seller1 },
      )

      assert.equal(1, await getState(eth, gno))
      break
    }
    case 2:
      {
        await getIntoState(0, accounts, eth, gno)
        const auctionIndex = await getAuctionIndex()

        // ASSERT Auction has started
        await setAndCheckAuctionStarted(ST, BT)
        const auctionStart = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()

        await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 1.5)
        // clearing first auction
        await postBuyOrder(ST, BT, auctionIndex, 10 * ether * 3, buyer1)
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 3), valMinusFee(10 * ether) * 3, valMinusFee(10 * ether), ST, BT, 10 ** 16)
      }

      assert.equal(2, await getState(eth, gno))
      break
    case 3:
    {
      await getIntoState(0, accounts, eth, gno)
      await setAndCheckAuctionStarted(ST, BT)
      let auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()

      // non-clearing buyOrder
      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 1)
      await postBuyOrder(ST, BT, auctionIndex, 10 * ether, buyer1)

      // theoretical clearing at  0.5
      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.5)

      // check that auction is in right place
      auctionIndex = await getAuctionIndex()

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether), 0, 0, ST, BT, 0)
      assert.equal(3, await getState(eth, gno))
      break
    }  
    case 4:
    {
      await getIntoState(0, accounts, eth, gno)
      await setAndCheckAuctionStarted(ST, BT)
      let auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(ST.address, BT.address)).toNumber()
      
      // non-clearing buyOrder
      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 1)
      await postBuyOrder(ST, BT, auctionIndex, 10 * ether, buyer1)
      await postBuyOrder(BT, ST, auctionIndex, 2 * ether, buyer1)
      // theoretical clearing at  0.5
      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.4)

      // check that auction is in right place
      auctionIndex = await getAuctionIndex()

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether), 0, 0, ST, BT, 0)
      
      assert.equal(4, await getState(eth, gno))
      break
    }  
    case 5:
    {
      await getIntoState(2, accounts, eth, gno)
      const auctionIndex = await getAuctionIndex()

      // ASSERT Auction has started
      await setAndCheckAuctionStarted(ST, BT)

      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 1.5)
      // clearing first auction
      await postBuyOrder(BT, ST, auctionIndex, 10 * ether * 3, buyer1)
      
      assert.equal(5, await getState(contracts, eth, gno))
      break
    }
    case 6:
    {
      await getIntoState(4, accounts, eth, gno)
      const auctionIndex = await getAuctionIndex()

      // ASSERT Auction has started
      await setAndCheckAuctionStarted(ST, BT)

      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.4)

      // clearing first auction
      await postBuyOrder(ST, BT, auctionIndex, 5 * ether, buyer1)
      
      assert.equal(6, await getState(eth, gno))
      break
    }  
    case 7:
    {
      await getIntoState(1, accounts, eth, gno)
      const auctionIndex = await getAuctionIndex()

      // ASSERT Auction has started
      await setAndCheckAuctionStarted(ST, BT)
      // clearing first auction
      await postBuyOrder(ST, BT, auctionIndex, 10 * ether * 2, buyer1)

      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.9)
      
      assert.equal(7, await getState(eth, gno))
      break
    }   
    default:
  }
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
  } = contracts)
}
const startBal = {
  startingETH: 90.0.toWei(),
  startingGNO: 90.0.toWei(),
  ethUSDPrice: 1008.0.toWei(),
  sellingAmount: 50.0.toWei(), // Same as web3.toWei(50, 'ether')
}


//
//
//
//  Testing State 0
//
//
//
//

const c1 = () => contract('DutchExchange - Stage S0 - Auction is running with v>0 in both auctions', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(0, accounts, eth, gno)
    assert.equal(0, await getState(eth, gno))
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  it('postBuyOrder - posting a buyOrdr to get into S2', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether * 3), valMinusFee(10 * ether) * 3, valMinusFee(10 * ether), eth, gno, 10 ** 16)
    assert.equal(2, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c2 = () => contract('DutchExchange - Stage S0 - Auction is running with v>0 in both auctions', (accounts) => {
  const [, , , buyer1] = accounts
  afterEach(() => gasLogger())
  after(eventWatcher.stopWatching)

  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // getting into the right state
    await getIntoState(0, accounts, eth, gno)

    eventWatcher(dx, 'Log', {})
  })

  it('postBuyOrder - posting a buyOrdr to and stay in S0', async () => {
    const auctionIndex = await getAuctionIndex()
    

    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(eth, gno, auctionIndex, (10 * ether), buyer1)
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether), 0, 0, eth, gno, 0)
    assert.equal(0, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
  it('timeelapse - getting into S3', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(eth, gno, auctionIndex, (10 * ether), buyer1)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.9)
    
    assert.equal(3, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c3 = () => contract('DutchExchange - Stage S0 - Auction is running with v>0 in both auctions', (accounts) => {
  const [, seller1, , , seller2] = accounts
  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(0, accounts, eth, gno)
    assert.equal(0, await getState(eth, gno))
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrder and stay in this state', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(eth, gno, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(eth, gno, 0, 10 * ether * 3, seller2)
    await assertRejects(postSellOrder(eth, gno, auctionIndex, 10 * ether * 3, seller1))
    await assertRejects(postSellOrder(eth, gno, auctionIndex + 2, 10 * ether * 3, seller1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), valMinusFee(10 * ether * 6), 0, 0, 0, eth, gno, 10 ** 16)
    assert.equal(0, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

//
//
//
//  Testing State 1
//
//
//
//


const c4 = () => contract('DutchExchange - Stage S1 - Auction is running with v == 0 in one auctions', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(1, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a buyOrder into 0 sell vol', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await assertRejects(postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, 0, 0, 0, 0, 0, gno, eth, 10 ** 16)
    assert.equal(1, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('postBuyOrder - posting a buyOrder to get into S5', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, eth, gno, 1)
    assert.equal(5, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c5 = () => contract('DutchExchange - Stage S1 - Auction is running with v == 0 in one auctions', (accounts) => {
  const [, , , buyer1] = accounts
  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // getting into the right state
    await getIntoState(1, accounts, eth, gno)

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a buyOrdr to and stay in S1', async () => {
    const auctionIndex = await getAuctionIndex()
    

    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(eth, gno, auctionIndex, (10 * ether), buyer1)
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether), 0, 0, eth, gno, 0)
    assert.equal(1, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
  it('timeelapse - getting into S7', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(eth, gno, auctionIndex, (10 * ether), buyer1)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.9)
    
    assert.equal(7, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c6 = () => contract('DutchExchange - Stage S1 - Auction is running with v == 0 in one auctions', (accounts) => {
  const [, seller1, , , seller2] = accounts
  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(1, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrder and stay in this state', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(eth, gno, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(eth, gno, 0, 10 * ether * 3, seller2)
    await assertRejects(postSellOrder(eth, gno, auctionIndex, 10 * ether * 3, seller1))
    await assertRejects(postSellOrder(eth, gno, auctionIndex + 2, 10 * ether * 3, seller1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), valMinusFee(10 * ether * 6), 0, 0, 0, eth, gno, 10 ** 16)
    assert.equal(1, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


//
//
//
//  Testing State 2
//
//
//
//


const c7 = () => contract('DutchExchange - Stage S2 -  1 Auction is running with v > 0, other auctions is closed', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(2, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a buyOrder into closed Auction', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await assertRejects(postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), 0, 0, 0, 0, gno, eth, 1)
    assert.equal(2, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('postBuyOrder - posting a buyOrder to get into S5', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // clearing first auction
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, eth, gno, 1)
    assert.equal(5, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c8 = () => contract('DutchExchange - Stage S2 -  1 Auction is running with v > 0, other auctions is closed', (accounts) => {
  const [, , , buyer1, buyer2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // getting into the right state
    await getIntoState(2, accounts, eth, gno)

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a buyOrdr to and stay in S2', async () => {
    const auctionIndex = await getAuctionIndex()
    

    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    // post buyOrder to clear auction with small overbuy
    await postBuyOrder(gno, eth, auctionIndex, (ether / 10), buyer1)
    
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), 0, valMinusFee(ether / 10), 0, 0, gno, eth, 0)
    assert.equal(2, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
  it('timeelapse - getting into S6', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.1)

    await postBuyOrder(gno, eth, auctionIndex, (ether * 5 / 2), buyer2)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.9)
    
    assert.equal(6, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c9 = () => contract('DutchExchange - Stage S2 -  1 Auction is running with v > 0, other auctions is closed', (accounts) => {
  const [, seller1, , , seller2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(2, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrder and stay in this state', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(gno, eth, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(gno, eth, 0, 10 * ether * 3, seller2)
    await assertRejects(postSellOrder(gno, eth, auctionIndex, 10 * ether * 3, seller1))
    await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10 * ether * 3, seller1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), valMinusFee(10 * ether * 6), 0, 0, 0, gno, eth, 1)
    assert.equal(2, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


const c10 = () => contract('DutchExchange - Stage S2 -  1 Auction is running with v > 0, other auctions is closed', (accounts) => {
  const [, seller1, , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(2, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder to get into S0', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    await postSellOrder(gno, eth, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(eth, gno, auctionIndex + 1, 10 * ether * 3, seller1)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    const nextStartingTime = timestamp() + 60 * 10 
    // clearing first auction
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, nextStartingTime, valMinusFee(10 * ether * 3), 0, 0, 0, 0, eth, gno, 1)
    assert.equal(0, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


const c11 = () => contract('DutchExchange - Stage S2 -  1 Auction is running with v > 0, other auctions is closed', (accounts) => {
  const [, seller1, , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(2, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder to get into S1', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    await postSellOrder(eth, gno, auctionIndex + 1, 10 * ether * 3, seller1)  
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    const nextStartingTime = timestamp() + 60 * 10 
    // clearing first auction
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, nextStartingTime, valMinusFee(10 * ether * 3), 0, 0, 0, 0, eth, gno, 1)
    assert.equal(1, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


//
//
//
//  Testing State 3
//
//
//
//


const c12 = () => contract('DutchExchange - Stage S3 -  1 Auction is closed theoretical', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(3, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a buyOrder into non- theoretical closed auction staying in S3', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    await postBuyOrder(gno, eth, auctionIndex, 5 * ether / 2 / 2 / 2, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), 0, valMinusFee(5 * ether / 2 / 2 / 2), 0, 0, gno, eth, 1)
    assert.equal(3, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S6', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), 0, 5 * ether / 2 / 2, valMinusFee(5 * ether / 2 / 2), valMinusFee(5 * ether), gno, eth, 10 ** 18)
    assert.equal(6, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c13 = () => contract('DutchExchange - Stage S3 -  1 Auction is closed theoretical', (accounts) => {
  const [, , , , buyer2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    // getting into the right state
    await getIntoState(3, accounts, eth, gno)

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('timeelapse - getting into S4', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    

    await postBuyOrder(gno, eth, auctionIndex, (ether * 5 / 2 / 2 / 2), buyer2)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.1)
    
    assert.equal(4, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c14 = () => contract('DutchExchange - Stage S3 -  1 Auction is closed theoretical', (accounts) => {
  const [, seller1, , , seller2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(3, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrder and stay in this state S3', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(gno, eth, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(gno, eth, 0, 10 * ether * 3, seller2)
    await assertRejects(postSellOrder(gno, eth, auctionIndex, 10 * ether * 3, seller1))
    await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10 * ether * 3, seller1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), valMinusFee(10 * ether * 6), 0, 0, 0, gno, eth, 1)
    assert.equal(3, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


const c15 = () => contract('DutchExchange - Stage S3 -  1 Auction is closed theoretical', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(3, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder to get into S2', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(10 * ether), 0, valMinusFee(10 * ether), valMinusFee(10 * ether), valMinusFee(10 * ether), eth, gno, 10 ** 16)
    assert.equal(2, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


//
//
//
//  Testing State 4
//
//
//
//


const c16 = () => contract('DutchExchange - Stage S4 -  both Auction are closed theoretical', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(4, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S6', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), 0, valMinusFee(2 * ether), valMinusFee(2 * ether), valMinusFee(5 * ether), gno, eth, 10 ** 18)
    assert.equal(6, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c17 = () => contract('DutchExchange - Stage S4 -  both Auction are closed theoretical', (accounts) => {
  const [, seller1, , , seller2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(4, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrder and stay in this state S4', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(gno, eth, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(gno, eth, 0, 10 * ether * 3, seller2)
    await assertRejects(postSellOrder(gno, eth, auctionIndex, 10 * ether * 3, seller1))
    await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10 * ether * 3, seller1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), valMinusFee(10 * ether * 6), valMinusFee(2 * ether), 0, 0, gno, eth, 1)
    assert.equal(4, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


//
//
//
//  Testing State 7
//
//
//
//


const c18 = () => contract('DutchExchange - Stage S7 -  both Auction are closed theoretical with vol=0 in one auction', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(7, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S5', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 1)
    assert.equal(5, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c19 = () => contract('DutchExchange - Stage S7 -  both Auction are closed theoretical with vol=0 in one auction', (accounts) => {
  const [, seller1, , , seller2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(7, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrder and stay in this state S7', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(gno, eth, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(gno, eth, 0, 10 * ether * 3, seller2)
    await assertRejects(postSellOrder(gno, eth, auctionIndex, 10 * ether * 3, seller1))
    await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10 * ether * 3, seller1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, 0, valMinusFee(10 * ether * 6), 0, 0, 0, gno, eth, 1)
    assert.equal(7, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c20 = () => contract('DutchExchange - Stage S7 -  both Auction are closed theoretical with vol=0 in one auction', (accounts) => {
  const [, seller2, , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(7, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S1', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    
    await postSellOrder(eth, gno, 0, 10 * ether * 3, seller2)  
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    const newAuctionStart = timestamp() + 60 * 10
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, newAuctionStart, 0, 0, 0, 0, 0, gno, eth, 1)
    assert.equal(1, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


const c21 = () => contract('DutchExchange - Stage S7 -  both Auction are closed theoretical with vol=0 in one auction', (accounts) => {
  const [, seller2, , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(7, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S0', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)

    await postSellOrder(gno, eth, 0, 10 * ether * 3, seller2) 
    
    await postSellOrder(eth, gno, 0, 10 * ether * 3, seller2)  
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction

    const newAuctionStart = timestamp() + 60 * 10
    await postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, newAuctionStart, valMinusFee(10 * ether * 3), 0, 0, 0, 0, gno, eth, 1)
    assert.equal(0, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


//
//
//
//  Testing State 6
//
//
//
//


const c22 = () => contract('DutchExchange - Stage S6 -  one auction closed, other one just closed theoretical', (accounts) => {
  const [, , , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(6, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder into alredy closed auction staying in S6', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    await assertRejects(postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), 0, valMinusFee(2 * ether), 0, 0, gno, eth, 10 ** 18)
    assert.equal(6, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('postBuyOrder - posting a buyOrder clsoing the theoretical auction and switch to  S5', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 0)
    assert.equal(5, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c23 = () => contract('DutchExchange - Stage S6 -  one auction closed, other one just closed theoretical', (accounts) => {
  const [, seller1, , , seller2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(6, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrder and stay in this state S6', async () => {
    const auctionIndex = await getAuctionIndex()
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(gno, eth, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(gno, eth, 0, 10 * ether * 3, seller2)
    await assertRejects(postSellOrder(gno, eth, auctionIndex, 10 * ether * 3, seller1))
    await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10 * ether * 3, seller1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(1, auctionStart, valMinusFee(5 * ether), valMinusFee(10 * ether * 6), valMinusFee(2 * ether), 0, 0, gno, eth, 1)
    assert.equal(6, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


const c24 = () => contract('DutchExchange - Stage S6 -  one auction closed, other one just closed theoretical', (accounts) => {
  const [, seller1, seller2, buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(6, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a buyOrder clsoing the theoretical auction and switch to  S0', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    await postSellOrder(gno, eth, auctionIndex + 1, 10 * ether * 3, seller1)
    await postSellOrder(eth, gno, 0, 10 * ether * 3, seller2)

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
    // clearing first auction
    const newAuctionStart = timestamp() + 60 * 10
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, newAuctionStart, valMinusFee(10 * ether * 3), 0, 0, 0, 0, gno, eth, 1)
    assert.equal(0, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


const c25 = () => contract('DutchExchange - Stage S6 -  one auction closed, other one just closed theoretical', (accounts) => {
  const [, seller1, , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(6, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a buyOrder clsoing the theoretical auction and switch to  S1', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    await postSellOrder(eth, gno, 0, 10 * ether, seller1)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.3)
    // clearing first auction
    const newAuctionStart = timestamp() + 60 * 10
    await postBuyOrder(gno, eth, auctionIndex, 10 * ether * 3, buyer1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, newAuctionStart, 0, 0, 0, 0, 0, gno, eth, 1)
    assert.equal(1, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

//
//
//
//  Testing State 5
//
//
//
//


const c26 = () => contract('DutchExchange - Stage S5 -  waiting to reach the threshold', (accounts) => {
  const [, seller1, , buyer1] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(5, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)


  it('postBuyOrder - posting a buyOrder should fail', async () => {
    const auctionIndex = await getAuctionIndex()      
    // clearing first auction
    await assertRejects(postBuyOrder(eth, gno, auctionIndex, 10 * ether * 3, buyer1))
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    assert.equal(5, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })

  it('postBuyOrder - posting a small sellOrder and staying in S5', async () => {
    const auctionIndex = await getAuctionIndex()
      
    // clearing first auction
    await postSellOrder(gno, eth, auctionIndex, ether / 10, seller1)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, 1, valMinusFee(ether / 10), 0, 0, 0, 0, gno, eth, 0)
    assert.equal(5, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

const c27 = () => contract('DutchExchange - Stage S5 -  waiting to reach the threshold', (accounts) => {
  const [, seller1, , , seller2] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(5, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postSellOrder - posting a SellOrders and switch to S0', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
      
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    // clearing first auction
    await postSellOrder(gno, eth, auctionIndex, ether / 10, seller1)
    const newAuctionStart = timestamp() + 60 * 10
    await postSellOrder(eth, gno, 0, 10 * ether * 30, seller2)
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, newAuctionStart, valMinusFee(ether / 10), 0, 0, 0, 0, gno, eth, 1)
    assert.equal(0, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})


const c28 = () => contract('DutchExchange - Stage S5 -  waiting to reach the threshold', (accounts) => {
  const [, , , , seller3] = accounts

  afterEach(() => gasLogger())
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // getting into the right state
    await getIntoState(5, accounts, eth, gno)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('postBuyOrder - posting a SellOrders and switch to S1', async () => {
    await setAndCheckAuctionStarted(eth, gno)

    const newAuctionStart = timestamp() + 60 * 10
    await postSellOrder(eth, gno, 0, 10 * ether, seller3)

    // clearing first auction
    // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
    await checkState(2, newAuctionStart, valMinusFee(10 * ether), 0, 0, 0, 0, eth, gno, 1)
    assert.equal(1, await getState(eth, gno))
    await checkInvariants(balanceInvariant, accounts, [eth, gno])
  })
})

enableContractFlag(c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23, c24, c25, c26, c27, c28)
