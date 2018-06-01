//
// This file tests all the states and their interaction as outlined here:
// https://drive.google.com/drive/folders/0ByHhiGx-ltJZczhjZHhHeGpHcHM
// States are generated with the function getIntoState and
// right state transitions are asserted with the function getState() == expectation
// https://drive.google.com/drive/folders/10_j3bMx6YngR0xKn5PXXiF1_Bi1eqeMR
// checkState is only a rough check for right updates of the numbers in the smart contract. It allows a big tolerance (Maxrounding error)
// since there are unpredicted timejumps with an evm_increase time


/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */


const {
  eventWatcher,
  logger,
  timestamp,
  assertRejects,
  gasLogger,
  enableContractFlag,
  makeSnapshot,
  revertSnapshot
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

// checkState is only a rough check for right updates of the numbers in the smart contract. It allows a big tolerance (MaxroundingError)
// since there are unpredicted timejumps with an evm_increase time, which are not caught.
// This shoud not be a issue, because the focus within these tests is system testing instead of unit testing.
// Testing exact amounts is not needed, since the correct execution of number updates is checked
// with our unit tests within dutchExchange-postBuyOrder/dutchExchange-postSellOrder
const checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
  const [
    stBtAuctionIndex,
    btStAuctionIndex,
    getAuctionStart,
    getSellVolumesCurrent,
    getSellVolumesNext,
    getBuyVolumes,
    getClosingPrices
  ] = await Promise.all([
    dx.getAuctionIndex.call(ST.address, BT.address),
    dx.getAuctionIndex.call(BT.address, ST.address),
    dx.getAuctionStart.call(ST.address, BT.address),
    dx.sellVolumesCurrent.call(ST.address, BT.address),
    dx.sellVolumesNext.call(ST.address, BT.address),
    dx.buyVolumes.call(ST.address, BT.address),
    dx.closingPrices.call(ST.address, BT.address, auctionIndex)
  ])

  assert.equal(stBtAuctionIndex.toNumber(), auctionIndex, 'auction index not correct')
  assert.equal(btStAuctionIndex.toNumber(), auctionIndex)

  let difference = Math.abs(getAuctionStart.toNumber() - auctionStart)
  assert.isAtMost(difference, 2, 'time difference bigger than 1 sec')

  assert.equal(getSellVolumesCurrent.toNumber(), sellVolumesCurrent, ' current SellVolume not correct')
  assert.equal(getSellVolumesNext.toNumber(), sellVolumesNext, 'sellVOlumeNext is incorrect')
  difference = Math.abs(getBuyVolumes.toNumber() - buyVolumes)
  logger('buyVolumes', buyVolumes)
  logger(getBuyVolumes.toNumber())
  assert.isAtMost(difference, MaxRoundingError, 'buyVolumes incorrect')

  const [closingPriceNumReal, closingPriceDenReal] = getClosingPrices
  logger('ClosingPriceNumReal', closingPriceNumReal)
  difference = Math.abs(closingPriceNumReal - closingPriceNum)
  assert.isAtMost(difference, MaxRoundingError, 'ClosingPriceNum not okay')
  assert.equal(closingPriceDenReal, closingPriceDen, 'ClosingPriceDen not okay')
}

// getState returns the current state for a SellToken(ST) - BuyToken(BT) pair
const getState = async (ST, BT) => { // eslint-disable-line
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
    [numP, denP],
    numBasedOnVolume,
    denBasedOnVolume,
    [numPP, denPP]
  ] = await Promise.all([
    (dx.getCurrentAuctionPrice.call(ST.address, BT.address, auctionIndex)),
    dx.buyVolumes.call(ST.address, BT.address),
    dx.sellVolumesCurrent.call(ST.address, BT.address),
    (dx.closingPrices.call(ST.address, BT.address, auctionIndex))
  ])

  const isAuctionTheoreticalClosed = (numP.mul(denBasedOnVolume).sub(numBasedOnVolume.mul(denP)).toNumber() <= 0);
  const isAuctionClosed = (numPP.toNumber() > 0)

  // calculate state of OppAuction
  const [
    [numP2, denP2],
    numBasedOnVolumeOpp,
    denBasedOnVolumeOpp,
    [numPPOpp, denPPOpp]
  ] = await Promise.all([
    (dx.getCurrentAuctionPrice.call(BT.address, ST.address, auctionIndex)),
    dx.buyVolumes.call(BT.address, ST.address),
    dx.sellVolumesCurrent.call(BT.address, ST.address),
    (dx.closingPrices.call(BT.address, ST.address, auctionIndex))
  ])

  const isOppAuctionTheoreticalClosed = (numP2.mul(denBasedOnVolumeOpp).minus(numBasedOnVolumeOpp.mul(denP2)).toNumber() <= 0);
  const isOppAuctionClosed = (numPPOpp.toNumber() > 0)

  // Got sellVolumesCurrent as denominator based on volume. Rename for better reading
  const sellVol = denBasedOnVolume.toNumber()
  const sellOppVol = denBasedOnVolumeOpp.toNumber()

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

// getIntoState pushes the current state of a pair SellToken(ST)-BuyToken(BT) into a specific state
const getIntoState = async (state, accounts, ST, BT) => {
  const [, seller1, buyer1] = accounts
  switch (state) {
    case 0:
    {
      await dx.addTokenPair(
        ST.address,
        BT.address,
        10.0.toWei(),
        5.0.toWei(),
        2,
        1,
        { from: seller1 },
      )

      assert.equal(0, await getState(eth, gno))
      break
    }
    case 1:
    {
      await dx.addTokenPair(
        ST.address,
        BT.address,
        10.0.toWei(),
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
        await postBuyOrder(ST, BT, auctionIndex, 10.0.toWei() * 3, buyer1)
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        await checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei() * 3), valMinusFee(10.0.toWei()) * 3, valMinusFee(10.0.toWei()), ST, BT, 10 ** 16)
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
      await checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei()), 0, 0, ST, BT, 0)
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
      await postBuyOrder(ST, BT, auctionIndex, 10.0.toWei(), buyer1)
      await postBuyOrder(BT, ST, auctionIndex, 2.0.toWei(), buyer1)
      // theoretical clearing at  0.5
      await waitUntilPriceIsXPercentOfPreviousPrice(ST, BT, 0.4)

      // check that auction is in right place
      auctionIndex = await getAuctionIndex()

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei()), 0, 0, ST, BT, 0)

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
      await postBuyOrder(BT, ST, auctionIndex, 10.0.toWei() * 3, buyer1)

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
      await postBuyOrder(ST, BT, auctionIndex, 5.0.toWei(), buyer1)

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
      await postBuyOrder(ST, BT, auctionIndex, 10.0.toWei() * 2, buyer1)

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
  logger('invariant before', invariant.map(v => v.toNumber()))
  logger('invariant after', newBalanceInvariant.map(v => v.toNumber()))
  for (let i = 0; i < tokens.length; i += 1) {
    assert.isAtMost(balanceInvariant[i].minus(newBalanceInvariant[i]).abs().toNumber(), allowedRoundingErrors, `issue with Token${i}`)
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
  startingETH: 100.0.toWei(),
  startingGNO: 100.0.toWei(),
  ethUSDPrice: 1000.0.toWei(),
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

contract('DutchExchange - stateTransitions', (accounts) => {
  const [master, seller1, seller2, buyer1, buyer2, seller3] = accounts

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

  describe('DutchExchange - Stage S0 - Auction is running with v>0 in both auctions', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      await getIntoState(0, accounts, eth, gno)
      assert.equal(0, await getState(eth, gno))
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
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1)

      const[ state ] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei() * 3), valMinusFee(10.0.toWei()) * 3, valMinusFee(10.0.toWei()), eth, gno, 10 ** 16),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(2, state)
    })

    it('postSellOrder - posting a SellOrder and stay in this state', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(eth, gno, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(eth, gno, 0, 10.0.toWei() * 3, seller2)
      await assertRejects(postSellOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, seller1))
      await assertRejects(postSellOrder(eth, gno, auctionIndex + 2, 10.0.toWei() * 3, seller1))

      const [ state ] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(10.0.toWei()), valMinusFee(10.0.toWei() * 6), 0, 0, 0, eth, gno, 1),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(0, state)
    })
  })

  // FIXME this tests are not stateless
  // The second fails if state is reset after first ends
  describe('DutchExchange - Stage S0 - Auction is running with v>0 in both auctions', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      await getIntoState(0, accounts, eth, gno)
      assert.equal(0, await getState(eth, gno))
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder and stay in S0', async () => {
      const auctionIndex = await getAuctionIndex()

      await setAndCheckAuctionStarted(eth, gno)
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(eth, gno, auctionIndex, (10.0.toWei()), buyer1)

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei()), 0, 0, eth, gno, 0)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('timeelapse - getting into S3', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(eth, gno, auctionIndex, (10.0.toWei()), buyer1)
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
      assert.equal(1, await getState(eth, gno))
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
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await assertRejects(postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1))

      const [ state ] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, 0, 0, 0, 0, 0, gno, eth, 0),
        checkInvariants(balanceInvariant, accounts, [eth, gno])

      ])
      assert.equal(1, state)
    })

    it('postBuyOrder - posting a buyOrder to get into S5', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1)

      const [ state ] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(2, 1, 0, 0, 0, 0, 0, eth, gno, 1),
        checkInvariants(balanceInvariant, accounts, [eth, gno])

      ])
      assert.equal(5, state)
    })

    it('postSellOrder - posting a SellOrder and stay in this state', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(eth, gno, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(eth, gno, 0, 10.0.toWei() * 3, seller2)
      await assertRejects(postSellOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, seller1))
      await assertRejects(postSellOrder(eth, gno, auctionIndex + 2, 10.0.toWei() * 3, seller1))

      const [ state ] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(10.0.toWei()), valMinusFee(10.0.toWei() * 6), 0, 0, 0, eth, gno, 0),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(1, state)
    })
  })

  // FIXME this tests are not stateless
  // The second fails if state is reset after first ends
  describe('DutchExchange - Stage S1 - Auction is running with v == 0 in one auctions', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(1, accounts, eth, gno)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder and stay in S1', async () => {
      const auctionIndex = await getAuctionIndex()

      await setAndCheckAuctionStarted(eth, gno)
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(eth, gno, auctionIndex, (10.0.toWei()), buyer1)

      const [ state ] = await Promise.all([
        getState(eth, gno),
        // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
        checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei()), 0, 0, eth, gno, 0),
        checkInvariants(balanceInvariant, accounts, [eth, gno])
      ])
      assert.equal(1, state)
    })

    it('timeelapse - getting into S7', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(eth, gno, auctionIndex, (10.0.toWei()), buyer1)
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
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await assertRejects(postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, 0, 0, 0, gno, eth, 1)
      assert.equal(2, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder to get into S5', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, 1, 0, 0, 0, 0, 0, eth, gno, 1)
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a SellOrder and stay in this state', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(gno, eth, 0, 10.0.toWei() * 3, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10.0.toWei() * 3, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), valMinusFee(10.0.toWei() * 6), 0, 0, 0, gno, eth, 1)
      assert.equal(2, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder to get into S0', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      await postSellOrder(gno, eth, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(eth, gno, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      const nextStartingTime = timestamp() + 60 * 10
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, nextStartingTime, valMinusFee(10.0.toWei() * 3), 0, 0, 0, 0, eth, gno, 1)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder to get into S1', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      await postSellOrder(eth, gno, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      const nextStartingTime = timestamp() + 60 * 10
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, nextStartingTime, valMinusFee(10.0.toWei() * 3), 0, 0, 0, 0, eth, gno, 1)
      assert.equal(1, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })
  })

  // FIXME this tests are not stateless
  // The second fails if state is reset after first ends
  describe('DutchExchange - Stage S2 -  1 Auction is running with v > 0, other auctions is closed', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(2, accounts, eth, gno)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder and stay in S2', async () => {
      const auctionIndex = await getAuctionIndex()

      await setAndCheckAuctionStarted(eth, gno)
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

      // post buyOrder to clear auction with small overbuy
      await postBuyOrder(gno, eth, auctionIndex, (ether / 10), buyer1)

      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(ether / 10), 0, 0, gno, eth, 0)
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
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 5.0.toWei() / 2 / 2 / 2, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(5.0.toWei() / 2 / 2 / 2), 0, 0, gno, eth, 1)
      assert.equal(3, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction: getting into S6', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, 5.0.toWei() / 2 / 2, valMinusFee(5.0.toWei() / 2 / 2), valMinusFee(5.0.toWei()), gno, eth, 10 ** 18)
      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('timeelapse - getting into S4', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)


      await postBuyOrder(gno, eth, auctionIndex, (ether * 5 / 2 / 2 / 2), buyer2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.1)

      assert.equal(4, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a SellOrder and stay in this state S3', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(gno, eth, 0, 10.0.toWei() * 3, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10.0.toWei() * 3, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), valMinusFee(10.0.toWei() * 6), 0, 0, 0, gno, eth, 1)
      assert.equal(3, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder to get into S2', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei(), buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(10.0.toWei()), 0, valMinusFee(10.0.toWei()), valMinusFee(10.0.toWei()), valMinusFee(10.0.toWei()), eth, gno, 10 ** 16)
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
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(2.0.toWei()), valMinusFee(2.0.toWei()), valMinusFee(5.0.toWei()), gno, eth, 1)
      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a sellOrder and stay in this state S4', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(gno, eth, 0, 10.0.toWei() * 3, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10.0.toWei() * 3, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), valMinusFee(10.0.toWei() * 6), valMinusFee(2.0.toWei()), 0, 0, gno, eth, 1)
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

  describe('DutchExchange - Stage S7 -  both auction are closed theoretical with vol=0 in one auction', () => {
    beforeEach(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(7, accounts, eth, gno)
    })

    afterEach(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S5', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 1)
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a SellOrder and stay in this state S7', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(gno, eth, 0, 10.0.toWei() * 3, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10.0.toWei() * 3, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, 0, valMinusFee(10.0.toWei() * 6), 0, 0, 0, gno, eth, 1)
      assert.equal(7, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S1', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await postSellOrder(eth, gno, 0, 10.0.toWei() * 3, seller2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      const newAuctionStart = timestamp() + 60 * 10
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, 0, 0, 0, 0, 0, gno, eth, 1)
      assert.equal(1, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder clearing non-theoretical closed auction getting into S0', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await postSellOrder(gno, eth, 0, 10.0.toWei() * 3, seller2)

      await postSellOrder(eth, gno, 0, 10.0.toWei() * 3, seller2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction

      const newAuctionStart = timestamp() + 60 * 10
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(10.0.toWei() * 3), 0, 0, 0, 0, gno, eth, 1)
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
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await assertRejects(postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), 0, valMinusFee(2.0.toWei()), 0, 0, gno, eth, 0)
      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder closing the theoretical auction and switch to  S5', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, 1, 0, 0, 0, 0, 0, gno, eth, 0)
      assert.equal(5, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postSellOrder - posting a SellOrder and stay in this state S6', async () => {
      const auctionIndex = await getAuctionIndex()
      const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
      await setAndCheckAuctionStarted(eth, gno)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(gno, eth, 0, 10.0.toWei() * 3, seller2)
      await assertRejects(postSellOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, seller1))
      await assertRejects(postSellOrder(gno, eth, auctionIndex + 2, 10.0.toWei() * 3, seller1))
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(1, auctionStart, valMinusFee(5.0.toWei()), valMinusFee(10.0.toWei() * 6), valMinusFee(2.0.toWei()), 0, 0, gno, eth, 1)
      assert.equal(6, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder closing the theoretical auction and switch to  S0', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      await postSellOrder(gno, eth, auctionIndex + 1, 10.0.toWei() * 3, seller1)
      await postSellOrder(eth, gno, 0, 10.0.toWei() * 3, seller2)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)
      // clearing first auction
      const newAuctionStart = timestamp() + 60 * 10
      await postBuyOrder(gno, eth, auctionIndex, 10.0.toWei() * 3, buyer1)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(10.0.toWei() * 3), 0, 0, 0, 0, gno, eth, 1)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a buyOrder closing the theoretical auction and switch to  S1', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      await postSellOrder(eth, gno, 0, 10.0.toWei(), seller1)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.3)
      // clearing first auction
      const newAuctionStart = timestamp() + 60 * 10
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

    it('postBuyOrder - posting a buyOrder should fail', async () => {
      const auctionIndex = await getAuctionIndex()
      // clearing first auction
      await assertRejects(postBuyOrder(eth, gno, auctionIndex, 10.0.toWei() * 3, buyer1))
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

  describe('DutchExchange - Stage S5 -  waiting to reach the threshold', () => {
    beforeEach(async () => {
      currentSnapshotId = await makeSnapshot()

      // getting into the right state
      await getIntoState(5, accounts, eth, gno)
    })

    afterEach(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('postSellOrder - posting a SellOrders and switch to S0', async () => {
      const auctionIndex = await getAuctionIndex()

      await setAndCheckAuctionStarted(eth, gno)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // clearing first auction
      await postSellOrder(gno, eth, auctionIndex, ether / 10, seller1)
      const newAuctionStart = timestamp() + 60 * 10
      await postSellOrder(eth, gno, 0, 10.0.toWei() * 30, seller2)
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(ether / 10), 0, 0, 0, 0, gno, eth, 1)
      assert.equal(0, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })

    it('postBuyOrder - posting a SellOrders and switch to S1', async () => {
      await setAndCheckAuctionStarted(eth, gno)

      const newAuctionStart = timestamp() + 60 * 10
      await postSellOrder(eth, gno, 0, 10.0.toWei(), seller3)

      // clearing first auction
      // checkState = async (auctionIndex, auctionStart, sellVolumesCurrent, sellVolumesNext, buyVolumes, closingPriceNum, closingPriceDen, ST, BT, MaxRoundingError) => {
      await checkState(2, newAuctionStart, valMinusFee(10.0.toWei()), 0, 0, 0, 0, eth, gno, 1)
      assert.equal(1, await getState(eth, gno))
      await checkInvariants(balanceInvariant, accounts, [eth, gno])
    })
  })

})
