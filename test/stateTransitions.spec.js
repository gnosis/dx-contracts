/* global contract, assert */
/* eslint no-undef: "error" */

// This file tests all the states and their interaction as outlined here:
// https://drive.google.com/drive/folders/0ByHhiGx-ltJZczhjZHhHeGpHcHM
// States are generated with the function getIntoState and
// right state transitions are asserted with the function getState() == expectation
// https://drive.google.com/drive/folders/10_j3bMx6YngR0xKn5PXXiF1_Bi1eqeMR
// checkState is only a rough check for right updates of the numbers in the smart contract. It allows a big tolerance (Maxrounding error)
// since there are unpredicted timejumps with an evm_increase time

const {
  BN_ZERO,
  ETH_5_WEI,
  ETH_10_WEI,
  ETH_20_WEI,
  eventWatcher,
  logger,
  timestamp,
  assertRejects,
  gasLogger,
  makeSnapshot,
  revertSnapshot,
  valMinusFee
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
  checkState
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
let balanceInvariant
const ether5 = ETH_5_WEI
const ether10 = ETH_10_WEI
const ether20 = ETH_20_WEI

let contracts

// getState returns the current state for a SellToken(ST) - BuyToken(BT) pair
const getState = async (ST, BT) => {
  const [
    getAuctionStart,
    auctionIndex
  ] = await Promise.all([
    dx.getAuctionStart.call(eth.address, gno.address),
    getAuctionIndex()
  ])

  const auctionStart = getAuctionStart.toNumber()
  if (auctionStart === 1) { return 5 }

  // calculate state of Auction
  const [
    { num: numP, den: denP },
    numBasedOnVolume,
    denBasedOnVolume,
    { num: numPP, den: denPP }
  ] = await Promise.all([
    dx.getCurrentAuctionPrice.call(ST.address, BT.address, auctionIndex),
    dx.buyVolumes.call(ST.address, BT.address),
    dx.sellVolumesCurrent.call(ST.address, BT.address),
    dx.closingPrices.call(ST.address, BT.address, auctionIndex)
  ])

  const isAuctionTheoreticalClosed = numP.mul(denBasedOnVolume).sub(numBasedOnVolume.mul(denP)).lte(BN_ZERO)
  const isAuctionClosed = (numPP.gt(BN_ZERO))

  // calculate state of OppAuction
  const [
    { num: numP2, den: denP2 },
    numBasedOnVolumeOpp,
    denBasedOnVolumeOpp,
    { num: numPPOpp, den: denPPOpp }
  ] = await Promise.all([
    dx.getCurrentAuctionPrice.call(BT.address, ST.address, auctionIndex),
    dx.buyVolumes.call(BT.address, ST.address),
    dx.sellVolumesCurrent.call(BT.address, ST.address),
    dx.closingPrices.call(BT.address, ST.address, auctionIndex)
  ])

  const isOppAuctionTheoreticalClosed = numP2.mul(denBasedOnVolumeOpp).sub(numBasedOnVolumeOpp.mul(denP2)).lte(BN_ZERO)
  const isOppAuctionClosed = (numPPOpp.gt(BN_ZERO))

  // Got sellVolumesCurrent as denominator based on volume. Rename for better reading
  const sellVol = denBasedOnVolume
  const sellOppVol = denBasedOnVolumeOpp

  // calculating final state
  // check for state S1 and S4
  if (sellVol.isZero() || sellOppVol.isZero()) {
    if (sellVol.isZero() && isOppAuctionTheoreticalClosed) { return 7 }
    if (sellOppVol.isZero() && isAuctionTheoreticalClosed) { return 7 }
    return 1
  }

  // State 4, both auctions theoretical closed
  if (isOppAuctionTheoreticalClosed && isAuctionTheoreticalClosed &&
    !isOppAuctionClosed && !isAuctionClosed) {
    return 4
  }

  // check for state 2 and 6
  // State 2, one auction is closed and the other is running
  // State 6, one auction is closed and the other theoretical closed
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

  // State 3, one auction theoretical closed and the other is running
  if (isOppAuctionTheoreticalClosed || isAuctionTheoreticalClosed) {
    return 3
  }

  // only state 0 is left
  return 0
}

// getIntoState pushes the current state of a pair SellToken(ST)-BuyToken(BT) into a specific state
const getIntoState = async (state, accounts, ST, BT) => {
  const [, seller1, buyer1] = accounts
  switch (state) {
    case 0:
    {
      await dx.addTokenPair(
        ST.address,
        BT.address,
        ether10,
        ether5,
        2,
        1,
        { from: seller1 }
      )

      assert.equal(0, await getState(eth, gno))
      break
    }
    case 1:
    {
      await dx.addTokenPair(
        ST.address,
        BT.address,
        ether10,
        0,
        2,
        1,
        { from: seller1 }
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
        await postBuyOrder(ST, BT, auctionIndex, 30.0.toWei(), buyer1)
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        await checkState(1, auctionStart, valMinusFee(ether10), 0, valMinusFee(30.0.toWei()), valMinusFee(30.0.toWei()), valMinusFee(ether10), ST, BT, 10 ** 16)
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
      await postBuyOrder(ST, BT, auctionIndex, 10.0.toWei(), buyer1)

      // theoretical clearing at  0.5
      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.5)

      // check that auction is in right place
      auctionIndex = await getAuctionIndex()

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(ether10), 0, valMinusFee(ether10), BN_ZERO, 0, ST, BT, 0)
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
      await postBuyOrder(ST, BT, auctionIndex, ether10, buyer1)
      await postBuyOrder(BT, ST, auctionIndex, 2.0.toWei(), buyer1)
      // theoretical clearing at  0.5
      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.4)

      // check that auction is in right place
      auctionIndex = await getAuctionIndex()

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(ether10), 0, valMinusFee(ether10), BN_ZERO, 0, ST, BT, 0)

      assert.equal(4, await getState(eth, gno))
      break
    }
    case 5:
    {
      await getIntoState(2, accounts, eth, gno)
      const auctionIndex = await getAuctionIndex()

      // clearing first auction
      await postBuyOrder(BT, ST, auctionIndex, ether20, buyer1)

      assert.equal(5, await getState(contracts, eth, gno))
      break
    }
    case 6:
    {
      await getIntoState(4, accounts, eth, gno)
      const auctionIndex = await getAuctionIndex()

      // clearing first auction
      await postBuyOrder(ST, BT, auctionIndex, ether5, buyer1)

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
      await postBuyOrder(ST, BT, auctionIndex, ether20, buyer1)

      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.9)

      assert.equal(7, await getState(eth, gno))
      break
    }
    default:
  }
}

// checkInvariants tests that the total balance of tokens held by the dutchExchange
// by all users and all auctions is staying constant
const checkInvariants = async (invariant, accounts, tokens, allowedRoundingErrors = 1) => {
  const newBalanceInvariant = await calculateTokensInExchange(accounts, tokens)
  logger('invariant before', invariant.map(v => v.toString()))
  logger('invariant after', newBalanceInvariant.map(v => v.toString()))
  for (let i = 0; i < tokens.length; i += 1) {
    assert.isAtMost(balanceInvariant[i].sub(newBalanceInvariant[i]).abs().toNumber(), allowedRoundingErrors, `issue with Token${i}`)
  }
}

const setupContracts = async () => {
  contracts = await getContracts({ resetCache: true });
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno
  } = contracts)
}
const startBal = {
  startingETH: 100.0.toWei(),
  startingGNO: 100.0.toWei(),
  ethUSDPrice: 1000.0.toWei(),
  sellingAmount: 50.0.toWei() // Same as web3.toWei(50, 'ether')
}

contract('DutchExchange - stateTransitions', accounts => {
  const [, seller1, seller2, buyer1, buyer2, seller3] = accounts

  afterEach(gasLogger)
  after(eventWatcher.stopWatching)

  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)
    // calculate the invariants
    balanceInvariant = await calculateTokensInExchange(accounts, [eth, gno])

    eventWatcher(dx, 'Log', {})
  })

  let currentSnapshotId
  let localSnapshotId

  //
  //
  //
  //  Testing State 0
  //
  //
  //
  //

  describe('DutchExchange - Stage S0 - Auction is running with v>0 in both auctions', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      await getIntoState(0, accounts, eth, gno)

      await setAndCheckAuctionStarted(eth, gno)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder to get into S2', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, 30.0.toWei(), buyer1)

      const [state] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(ether10), 0, valMinusFee(30.0.toWei()), valMinusFee(30.0.toWei()), valMinusFee(ether10), eth, gno, 10 ** 16),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(2, state)
    })

    it('postSellOrder - posting a SellOrder and stay in this state', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(eth, gno, auctionIndex + 1, 30.0.toWei(), seller1)
      await postSellOrder(eth, gno, 0, 30.0.toWei(), seller2)
      await assertRejects(postSellOrder(eth, gno, auctionIndex, 30.0.toWei(), seller1))
      await assertRejects(postSellOrder(eth, gno, auctionIndex + 2, 30.0.toWei(), seller1))

      const [state] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(ether10), valMinusFee(60.0.toWei()), BN_ZERO, BN_ZERO, 0, eth, gno, 1),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(0, state)
    })

    it('postBuyOrder - posting a buyOrder and stay in S0', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(eth, gno, auctionIndex, (ether10), buyer1)

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(ether10), 0, valMinusFee(ether10), BN_ZERO, 0, eth, gno, 0)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('timeelapse - getting into S3', async () => {
      const auctionIndex = await getAuctionIndex()

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with overbuy
      await postBuyOrder(eth, gno, auctionIndex, ether20, buyer1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.9)

      assert.equal(3, await getState(eth, gno))
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

  describe('DutchExchange - Stage S1 - Auction is running with v == 0 in one auctions', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      await getIntoState(1, accounts, eth, gno)
      await setAndCheckAuctionStarted(eth, gno)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder into 0 sell volume', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      // await setAndCheckAuctionStarted(eth, gno)

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await assertRejects(postBuyOrder(gno, eth, auctionIndex, 30.0.toWei(), buyer1))

      const [state] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, 0, 0, BN_ZERO, BN_ZERO, 0, gno, eth, 0),
        checkInvariants(balanceInvariant, accounts, [eth, gno])

      ])
      assert.equal(1, state)
    })

    it('postBuyOrder - posting a buyOrder to get into S5', async () => {
      const auctionIndex = await getAuctionIndex()
      // await setAndCheckAuctionStarted(eth, gno)

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, 30.0.toWei(), buyer1)

      const [state] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(2, 1, 0, 0, BN_ZERO, BN_ZERO, 0, eth, gno, 1),
        checkInvariants(balanceInvariant, accounts, [eth, gno])

      ])
      assert.equal(5, state)
    })

    it('postSellOrder - posting a SellOrder and stay in this state', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      // await setAndCheckAuctionStarted(eth, gno)

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(eth, gno, auctionIndex + 1, 30.0.toWei(), seller1)
      await postSellOrder(eth, gno, 0, 30.0.toWei(), seller2)
      await assertRejects(postSellOrder(eth, gno, auctionIndex, 30.0.toWei(), seller1))
      await assertRejects(postSellOrder(eth, gno, auctionIndex + 2, 30.0.toWei(), seller1))

      const [state] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(10.0.toWei()), valMinusFee(60.0.toWei()), BN_ZERO, BN_ZERO, 0, eth, gno, 0),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(1, state)
    })

    it('postBuyOrder - posting a buyOrder and stay in S1', async () => {
      const auctionIndex = await getAuctionIndex()

      // await setAndCheckAuctionStarted(eth, gno)
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(eth, gno, auctionIndex, (10.0.toWei()), buyer1)

      const [state] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei()), BN_ZERO, 0, eth, gno, 0),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(1, state)
    })

    it('timeelapse - getting into S7', async () => {
      const auctionIndex = await getAuctionIndex()
      // await setAndCheckAuctionStarted(eth, gno)

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(eth, gno, auctionIndex, (20.0.toWei()), buyer1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.9)

      assert.equal(7, await getState(eth, gno))
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

  describe('DutchExchange - Stage S2 -  1 Auction is running with v > 0, other auctions is closed', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(2, accounts, eth, gno)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder into closed auction', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await assertRejects(postBuyOrder(eth, gno, auctionIndex, 30.0.toWei(), buyer1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(ether5), 0, BN_ZERO, BN_ZERO, 0, gno, eth, 1)
      assert.equal(2, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder to get into S5', async () => {
      const auctionIndex = await getAuctionIndex()

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 30.0.toWei(), buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, 1, 0, 0, BN_ZERO, BN_ZERO, 0, eth, gno, 1)
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a SellOrder and stay in this state', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, ether10, seller1)
      await postSellOrder(gno, eth, 0, ether10, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, ether10, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, ether10, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(ether5), valMinusFee(ether20), BN_ZERO, BN_ZERO, 0, gno, eth, 1)
      assert.equal(2, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder to get into S0', async () => {
      const auctionIndex = await getAuctionIndex()

      await postSellOrder(gno, eth, auctionIndex + 1, ether10, seller1)
      await postSellOrder(eth, gno, auctionIndex + 1, ether10, seller1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      const nextStartingTime = await timestamp() + 60 * 10
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, ether20, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, nextStartingTime, valMinusFee(ether10), 0, BN_ZERO, BN_ZERO, 0, eth, gno, 1)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder and stay in S2', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      assert.equal(2, await getState(eth, gno))

      // post buyOrder without clearing the auction
      await postBuyOrder(gno, eth, auctionIndex, 0.1.toWei(), buyer1)

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(0.1.toWei()), BN_ZERO, 0, gno, eth, 0)
      assert.equal(2, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('timeelapse - getting into S6', async () => {
      const auctionIndex = await getAuctionIndex()

      await postBuyOrder(gno, eth, auctionIndex, 2.5.toWei(), buyer2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.9)

      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    // TODO review: State 1 should be imposible now as is mandatory to fill both auction sides
    it.skip('postBuyOrder - posting a buyOrder to get into S1', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      await postSellOrder(eth, gno, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      const nextStartingTime = await timestamp() + 60 * 10
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, nextStartingTime, valMinusFee(10.0.toWei() * 3), 0, 0, 0, 0, eth, gno, 1)
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

  describe('DutchExchange - Stage S3 -  1 auction is closed theoretical', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(3, accounts, eth, gno)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder into non-theoretical closed auction staying in S3', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 0.5.toWei(), buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(0.5.toWei()), BN_ZERO, 0, gno, eth, 1)
      assert.equal(3, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction: getting into S6', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 1.25.toWei(), buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(1.25.toWei()), valMinusFee(1.25.toWei()), valMinusFee(5.0.toWei()), gno, eth, 10 ** 16)
      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('timeelapse - getting into S4', async () => {
      const auctionIndex = await getAuctionIndex()

      await postBuyOrder(gno, eth, auctionIndex, 0.5.toWei(), buyer2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.1)

      assert.equal(4, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a SellOrder and stay in this state S3', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, ether10, seller1)
      await postSellOrder(gno, eth, 0, ether10, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, 30.0.toWei(), seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 30.0.toWei(), seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(ether5), valMinusFee(ether20), BN_ZERO, BN_ZERO, 0, gno, eth, 1)
      assert.equal(3, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder to get into S2', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, ether10, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(ether10), 0, valMinusFee(ether10), valMinusFee(ether10), valMinusFee(ether10), eth, gno, 10 ** 16)
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

  describe('DutchExchange - Stage S4 -  both Auction are closed theoretical', () => {
    beforeEach(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(4, accounts, eth, gno)
    })

    afterEach(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder clearing theoretical closed auction getting into S6', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 30.0.toWei(), buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(2.0.toWei()), valMinusFee(2.0.toWei()), valMinusFee(5.0.toWei()), gno, eth, 1)
      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a sellOrder clearing theoretical closed auction getting into S6', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, ether10, seller1)
      await postSellOrder(gno, eth, 0, ether10, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, ether10, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, ether10, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), valMinusFee(ether20), valMinusFee(2.0.toWei()), valMinusFee(2.0.toWei()), valMinusFee(5.0.toWei()), gno, eth, 1)
      assert.equal(6, await getState(eth, gno))
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

  describe('DutchExchange - Stage S7 -  both auction are closed theoretical with vol=0 in one auction', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(7, accounts, eth, gno)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S5', async () => {
      const auctionIndex = await getAuctionIndex()

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, 30.0.toWei(), buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, 1, 0, 0, BN_ZERO, BN_ZERO, 0, gno, eth, 1)
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a SellOrder and stay in this state S7', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, ether10, seller1)
      await postSellOrder(gno, eth, 0, ether10, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, ether10, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, ether10, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, 0, valMinusFee(ether20), BN_ZERO, BN_ZERO, 0, gno, eth, 1)
      assert.equal(7, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    // TODO review: State 1 should be imposible now as is mandatory to fill both auction sides
    it.skip('postBuyOrder - posting a sellOrder clearing non-theoretical closed auction getting into S1', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      // clearing first auction
      const newAuctionStart = await timestamp() + 60 * 10
      await postSellOrder(eth, gno, 0, 10.0.toWei() * 3, seller2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, 0, 0, 0, 0, 0, gno, eth, 1)
      assert.equal(1, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a sellOrder clearing non-theoretical closed auction getting into S0', async () => {
      // clearing first auction
      await postSellOrder(gno, eth, 0, 30.0.toWei(), seller2)
      await postSellOrder(eth, gno, 0, ether10, seller2)
      const newAuctionStart = await timestamp() + 60 * 10

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(30.0.toWei()), 0, BN_ZERO, BN_ZERO, 0, gno, eth, 1)
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

  describe('DutchExchange - Stage S6 -  one auction closed, other one just closed theoretical', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(6, accounts, eth, gno)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder into alredy closed auction staying in S6', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()

      // clearing first auction
      await assertRejects(postBuyOrder(eth, gno, auctionIndex, ether20, buyer1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(2.0.toWei()), BN_ZERO, 0, gno, eth, 0)
      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder closing the theoretical auction and switch to  S5', async () => {
      const auctionIndex = await getAuctionIndex()

      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 30.0.toWei(), buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, 1, 0, 0, BN_ZERO, BN_ZERO, 0, gno, eth, 0)
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a sellOrder closing the theoretical auction and switch to S0', async () => {
      const auctionIndex = await getAuctionIndex()

      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, 30.0.toWei(), seller1)
      await postSellOrder(eth, gno, 0, 30.0.toWei(), seller2)
      const newAuctionStart = await timestamp() + 60 * 10

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(30.0.toWei()), 0, BN_ZERO, BN_ZERO, 0, gno, eth, 1)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    // TODO review: State 1 should be imposible now as is mandatory to fill both auction sides
    it.skip('postBuyOrder - posting a buyOrder closing the theoretical auction and switch to S1', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      await postSellOrder(eth, gno, 0, 10.0.toWei(), seller1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.3)
      // clearing first auction
      const newAuctionStart = await timestamp() + 60 * 10
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
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

  describe('DutchExchange - Stage S5 -  waiting to reach the threshold', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(5, accounts, eth, gno)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder should fail', async () => {
      const auctionIndex = await getAuctionIndex()
      // clearing first auction
      await assertRejects(postBuyOrder(eth, gno, auctionIndex, ether20, buyer1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a small sellOrder and staying in S5', async () => {
      const auctionIndex = await getAuctionIndex()

      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex, 0.1.toWei(), seller1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, 1, valMinusFee(0.1.toWei()), 0, BN_ZERO, BN_ZERO, 0, gno, eth, 0)
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting SellOrders for both sides and switch to S0', async () => {
      const auctionIndex = await getAuctionIndex()

      // clearing first auction
      await postSellOrder(eth, gno, auctionIndex, ether10, seller1)
      await postSellOrder(gno, eth, auctionIndex, 30.0.toWei(), seller2)
      const newAuctionStart = await timestamp() + 60 * 10
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(ether10), 0, BN_ZERO, BN_ZERO, 0, eth, gno, 1)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    // TODO review: State 1 should be imposible now as is mandatory to fill both auction sides
    it.skip('postBuyOrder - posting a SellOrder and switch to S1', async () => {
      // await setAndCheckAuctionStarted(eth, gno)

      const newAuctionStart = await timestamp() + 60 * 10
      await postSellOrder(eth, gno, 0, 10.0.toWei(), seller3)

      // clearing first auction
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(10.0.toWei()), 0, 0, 0, 0, eth, gno, 1)
      assert.equal(1, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })
  })
})
