/* global contract, assert, timestamp */
/* eslint no-undef: "error" */

/* Fee Reduction Token issuing is tested seperately in dutchExchange-MGN.js */

const {
  eventWatcher,
  log: utilsLog,
  assertRejects,
  enableContractFlag,
  gasLogger,
  makeSnapshot,
  revertSnapshot,
  timestamp,
  AUCTION_START_WAITING_FOR_FUNDING
} = require('./utils')

const SECONDS_24H = 86405

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
  postSellOrder,
  getAuctionStart,
  wait
} = require('./testFunctions')
// Restore state
let snapshotId

// Test VARS
let eth, gno, dx, oracle

let threshold, usdEthPrice
let amountEthBelowThreshold, amountEthAboveThreshold, amountGnoBelowTheshold, amountGnoAboveThreshold

let contracts

const separateLogs = () => utilsLog('\n    ----------------------------------')
beforeEach(separateLogs)
afterEach(gasLogger)

const log = (...args) => utilsLog('\t', ...args)

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    PriceOracleInterface: oracle
  } = contracts)
}

const setupAmountUsedForTesting = async () => {
  // Amounts used for testing
  const [threshold, usdEthPriceAux, gnoEthPrice] = await Promise.all([
    dx.thresholdNewAuction().then(bn => bn.div(1e18).toNumber()),
    oracle.getUSDETHPrice.call().then(bn => bn.toNumber()),
    dx.getPriceOfTokenInLastAuction.call(gno.address).then(([num, den]) => num.div(den).toNumber())
  ])
  usdEthPrice = usdEthPriceAux
  log(`Threshold to start an auction: ${threshold}`)
  log(`USD-ETH price: ${usdEthPrice}`)
  log(`ETH-GNO price: ${gnoEthPrice}`)

  amountEthBelowThreshold = threshold * 0.9 / usdEthPrice
  amountEthAboveThreshold = threshold * 1.1 / usdEthPrice
  amountGnoBelowTheshold = threshold * 0.9 / usdEthPrice / gnoEthPrice
  amountGnoAboveThreshold = threshold * 1.1 / usdEthPrice / gnoEthPrice

  log(`Amounts used for testing:' 
    ETH:
      - below: ${amountEthBelowThreshold}
      - above: ${amountEthAboveThreshold}
    GNO:
      - below: ${amountGnoBelowTheshold}
      - above: ${amountGnoAboveThreshold}
  `)
}

const startBal = {
  startingETH: 90.0.toWei(),
  startingGNO: 90.0.toWei(),
  ethUSDPrice: 1008.0.toWei(),
  sellingAmount: 50.0.toWei() // Same as web3.toWei(50, 'ether')
}

contract('DutchExchange - start auction threshold', accounts => {
  const [, seller1] = accounts
  // const totalSellAmount2ndAuction = 10e18
  // const totalBuyAmount = 2 * 10e18
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10.0.toWei(),
      0,
      2,
      1,
      { from: seller1 }
    )

    await setupAmountUsedForTesting()

    // const auctionIndex = await getAuctionIndex()
    log('Start first auction')
    await setAndCheckAuctionStarted(eth, gno)

    log('Wait until we reach the prior price. 2 GNO = 1 WETH')
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)

    log('Close the first auction using 25 GNO')
    await postBuyOrder(eth, gno, 1, 25.0.toWei(), seller1)

    log('Take snapshot of Ganache: Auction 1 just cleared')
    snapshotId = makeSnapshot()
  })

  afterEach(gasLogger)
  afterEach(async () => {
    // log('Revert snapshot of Ganache')
    await revertSnapshot(snapshotId)
    snapshotId = makeSnapshot()
  })

  after(eventWatcher.stopWatching)

  it("1. doesn't start the auction when sellVolume is below the threshold in both sides", async () => {
    // GIVEN: Auction 2
    const auctionIndex = await getAuctionIndex(eth, gno)
    assert.strictEqual(auctionIndex, 2, 'should be in auction 2')

    // GIVEN: waiting for funding
    let auctionStart = await getAuctionStart(eth, gno)
    assert.strictEqual(auctionStart, AUCTION_START_WAITING_FOR_FUNDING, 'should be waiting for funding')

    // GIVEN: No sell volume
    const [sellerBalance, sellerBalanceOpp] = await Promise.all([
      getSellerBalance(seller1, eth, gno, auctionIndex),
      getSellerBalance(seller1, gno, eth, auctionIndex)
    ])
    assert.strictEqual(sellerBalance + sellerBalanceOpp, 0, 'no sell volume in any of the sides')

    // WHEN: A seller sell, below the threshold in ANY of the sides
    log(`Posting sell order below threshold --> WETH-GNO-${auctionIndex}: ${amountEthBelowThreshold}`)
    await postSellOrder(eth, gno, auctionIndex, amountEthBelowThreshold.toWei(), seller1)
    log(`Posting sell order below threshold --> GNO-WETH-${auctionIndex}: ${amountGnoBelowTheshold}`)
    await postSellOrder(gno, eth, auctionIndex, amountGnoBelowTheshold.toWei(), seller1)

    // THEN: The auction remains unscheduled
    auctionStart = await getAuctionStart(eth, gno)
    assert.strictEqual(auctionStart, AUCTION_START_WAITING_FOR_FUNDING, 'The auction should remain unscheduled')
  })

  it(`2. does't start if we surplus one of the sides`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: We surplus only one of the sides
    const auctionIndex = await getAuctionIndex(eth, gno)
    log(`Posting sell order above threshold --> WETH-GNO-${auctionIndex}: ${amountEthAboveThreshold}`)
    await postSellOrder(eth, gno, auctionIndex, amountEthAboveThreshold.toWei(), seller1)

    // THEN: The auction remains unscheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.strictEqual(auctionStart, AUCTION_START_WAITING_FOR_FUNDING, 'The auction should remain unscheduled')
  })

  it(`3. does't start if we surplus the opposite side`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: We surplus only the opposite side
    const auctionIndex = await getAuctionIndex(eth, gno)
    log(`Posting sell order above threshold --> GNO-WETH-${auctionIndex}: ${amountGnoAboveThreshold}`)
    await postSellOrder(gno, eth, auctionIndex, amountGnoAboveThreshold.toWei(), seller1)

    // THEN: The auction remains unscheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.strictEqual(auctionStart, AUCTION_START_WAITING_FOR_FUNDING, 'The auction should remain unscheduled')
  })

  it(`4. starts if we surplus both sides`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: We surplus both sides
    const auctionIndex = await getAuctionIndex(eth, gno)
    const now = timestamp()
    log(`Posting sell order below threshold --> WETH-GNO-${auctionIndex}: ${amountEthAboveThreshold}`)
    await postSellOrder(eth, gno, auctionIndex, amountEthAboveThreshold.toWei(), seller1)
    log(`Posting sell order below threshold --> GNO-WETH-${auctionIndex}: ${amountGnoAboveThreshold}`)
    await postSellOrder(gno, eth, auctionIndex, amountGnoAboveThreshold.toWei(), seller1)

    // THEN: The auction is scheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, now, 'The auction should be scheduled to start')
  })

  it(`5. starts if there is enough funding in one side and 24h goes by`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: We surplus only one of the sides
    const auctionIndex = await getAuctionIndex(eth, gno)
    const now = timestamp()
    log(`Posting sell order above threshold --> WETH-GNO-${auctionIndex}: ${amountEthAboveThreshold}`)
    await postSellOrder(eth, gno, auctionIndex, amountEthAboveThreshold.toWei(), seller1)

    // WHEN: 24h goes by
    await wait(SECONDS_24H)

    // WHEN: A seller "poke" the contract
    await postSellOrder(eth, gno, auctionIndex, 0.0, seller1)

    // THEN: The auction is scheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, now, 'The auction should be scheduled to start')
  })

  it(`6. starts if theres enough funding in the opposite side and 24h goes by`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: We surplus the opposite side
    const auctionIndex = await getAuctionIndex(eth, gno)
    const now = timestamp()
    log(`Posting sell order above threshold --> GNO-WETH-${auctionIndex}: ${amountGnoAboveThreshold}`)
    await postSellOrder(gno, eth, auctionIndex, amountGnoAboveThreshold.toWei(), seller1)

    // WHEN: 24h goes by
    await wait(SECONDS_24H)

    // WHEN: A seller "poke" the contract
    await postSellOrder(eth, gno, auctionIndex, 0.0, seller1)

    // THEN: The auction is scheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, now, 'The auction should be scheduled to start')
  })

  it(`7. starts if after 24h, someone surplus one side`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: 24h goes by
    await wait(SECONDS_24H)

    // WHEN: We surplus the opposite side
    const auctionIndex = await getAuctionIndex(eth, gno)
    const now = timestamp()
    log(`Posting sell order above threshold --> WETH-GNO-${auctionIndex}: ${amountEthAboveThreshold}`)
    await postSellOrder(eth, gno, auctionIndex, amountEthAboveThreshold.toWei(), seller1)

    // THEN: The auction is scheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, now, 'The auction should be scheduled to start')
  })

  it(`8. starts if after 24h, someone surplus the opposite side`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: 24h goes by
    await wait(SECONDS_24H)

    // WHEN: We surplus the opposite side
    const auctionIndex = await getAuctionIndex(eth, gno)
    const now = timestamp()
    log(`Posting sell order above threshold --> GNO-WETH-${auctionIndex}: ${amountGnoAboveThreshold}`)
    await postSellOrder(gno, eth, auctionIndex, amountGnoAboveThreshold.toWei(), seller1)

    // THEN: The auction is scheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, now, 'The auction should be scheduled to start')
  })

  // it(' 2. check for a throw, if seller contribution == 0', async () => {
  //   // prepare by clearing auction
  //   let auctionIndex = await getAuctionIndex()
  //   await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
  //   await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer1)
  //   auctionIndex = await getAuctionIndex()
  //   // await setAndCheckAuctionStarted(eth, gno)
  //   assert.equal(2, auctionIndex)

  //   // check that clearingTime was saved
  //   const clearingTime = await getClearingTime(gno, eth, auctionIndex)
  //   const now = timestamp()
  //   assert.equal(clearingTime, now, 'clearingTime was set')

  //   // check condition
  //   assert.equal((await dx.sellerBalances.call(eth.address, gno.address, 1, seller2)).toNumber(), 0)
  //   // now claiming should not be possible and return == 0
  //   await assertRejects(dx.claimSellerFunds(eth.address, gno.address, seller2, 1))
  // })

  // it(' 3. check for the correct return value', async () => {
  //   const auctionIndex = await getAuctionIndex()
  //   const [claimedAmount] = (await dx.claimSellerFunds.call(eth.address, gno.address, seller1, auctionIndex - 1)).map(i => i.toNumber())
  //   const [closingPriceNum] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex - 1)).map(i => i.toNumber())
  //   assert.equal(claimedAmount, closingPriceNum)
  // })

  // describe('4. Test claim after selling', () => {
  //   let currentSnapshotId
  //   beforeEach(async () => {
  //     currentSnapshotId = await makeSnapshot()
  //   })

  //   afterEach(async () => {
  //     await revertSnapshot(currentSnapshotId)
  //   })

  //   it('4.1. It should claim seller funds in an auction with 2 sellers', async () => {
  //     const auctionIndex = await getAuctionIndex()

  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)
  //     await postSellOrder(eth, gno, 0, totalSellAmount2ndAuction / 10, buyer2)

  //     // closing new auction
  //     await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
  //     await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)

  //     // withdraw and check the balance change
  //     const seller1BalanceBefore = await dx.balances.call(eth.address, seller1)
  //     const seller2BalanceBefore = await dx.balances.call(eth.address, seller2)
  //     await dx.claimSellerFunds(gno.address, eth.address, seller2, auctionIndex)
  //     await dx.claimSellerFunds(gno.address, eth.address, seller1, auctionIndex)
  //     const seller1BalanceAfter = await dx.balances.call(eth.address, seller1)
  //     const seller2BalanceAfter = await dx.balances.call(eth.address, seller2)
  //     const [closingPriceNum] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
  //     assert.equal(seller1BalanceBefore.add(closingPriceNum.mul(3).div(5)).toNumber(), seller1BalanceAfter.toNumber())
  //     assert.equal(seller2BalanceBefore.add(closingPriceNum.mul(2).div(5)).toNumber(), seller2BalanceAfter.toNumber())

  //     // check that the sellerBalances is set to 0
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //   })

  //   it('4.2. It should claim and withdraw seller funds in an auction with 2 sellers', async () => {
  //     const auctionIndex = await getAuctionIndex()
  //     // starting new auction with two sellers
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)
  //     await postSellOrder(eth, gno, 0, totalSellAmount2ndAuction / 10, buyer2)

  //     // closing new auction
  //     await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
  //     await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)

  //     // withdraw and check the balance change
  //     const [claimableAmtS1] = (await dx.claimSellerFunds.call(gno.address, eth.address, seller1, auctionIndex)).map(s => s.toNumber())
  //     const [claimableAmtS2] = (await dx.claimSellerFunds.call(gno.address, eth.address, seller2, auctionIndex)).map(s => s.toNumber())
  //     const seller1ETHBal = (await dx.balances.call(eth.address, seller1)).toNumber()
  //     const seller2ETHBal = (await dx.balances.call(eth.address, seller2)).toNumber()

  //     // claim claimable tokens and withdraw at same time
  //     await dx.claimAndWithdraw(gno.address, eth.address, seller2, auctionIndex, 10000.0.toWei(), { from: seller2 })
  //     await dx.claimAndWithdraw(gno.address, eth.address, seller1, auctionIndex, 10000.0.toWei(), { from: seller1 })

  //     const seller1ETHBalAfter = (await eth.balanceOf.call(seller1)).toNumber()
  //     const seller2ETHBalAfter = (await eth.balanceOf.call(seller2)).toNumber()

  //     // check that the sellerBalances is set to 0
  //     // assert that balance in DX of ETH + ClaimedAndWithdraw-n amount = correct amount
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //     assert.equal(seller1ETHBalAfter, seller1ETHBal + claimableAmtS1)
  //     assert.equal(seller2ETHBalAfter, seller2ETHBal + claimableAmtS2)
  //   })

  //   it('5.1. It should claim seller funds in an auction with 2 sellers', async () => {
  //     const auctionIndex = await getAuctionIndex()

  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)
  //     await postSellOrder(eth, gno, 0, 10e18, seller1)

  //     // closing new auction
  //     await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
  //     await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)
  //     await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer2)

  //     await postSellOrder(gno, eth, 0, 5e18, seller1)
  //     await postSellOrder(gno, eth, 0, 5e18, seller2)
  //     await postSellOrder(eth, gno, 0, 10e18, seller1)
  //     const auctionIndex2 = await getAuctionIndex()
  //     assert.equal(auctionIndex2, 3)
  //     await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
  //     await postBuyOrder(gno, eth, auctionIndex + 1, totalBuyAmount, buyer1)

  //     // withdraw and check the balance change
  //     const seller1BalanceBefore = await dx.balances.call(eth.address, seller1)
  //     const seller2BalanceBefore = await dx.balances.call(eth.address, seller2)
  //     await dx.claimTokensFromSeveralAuctionsAsSeller(
  //       [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller2)
  //     await dx.claimTokensFromSeveralAuctionsAsSeller(
  //       [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller1)
  //     const seller1BalanceAfter = await dx.balances.call(eth.address, seller1)
  //     const seller2BalanceAfter = await dx.balances.call(eth.address, seller2)
  //     const [closingPrice1Num] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
  //     const [closingPrice2Num] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex + 1)
  //     const seller1BalanceCalc = seller1BalanceBefore.add(closingPrice1Num.mul(3).div(5))
  //       .add(closingPrice2Num.mul(1).div(2))
  //     const seller2BalanceCalc = seller2BalanceBefore.add(closingPrice1Num.mul(2).div(5))
  //       .add(closingPrice2Num.mul(1).div(2))
  //     assert.equal(seller1BalanceCalc.toNumber(), seller1BalanceAfter.toNumber())
  //     assert.equal(seller2BalanceCalc.toNumber(), seller2BalanceAfter.toNumber())

  //     // check that the sellerBalances is set to 0
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //   })

  //   it('5.2. It should claim and withdraw seller funds in an auction with 2 sellers', async () => {
  //     const auctionIndex = await getAuctionIndex()
  //     // starting new auction with two sellers
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
  //     await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)
  //     await postSellOrder(eth, gno, 0, 10e18, seller1)

  //     // closing new auction
  //     await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
  //     await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)
  //     await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer2)

  //     await postSellOrder(gno, eth, 0, 5e18, seller1)
  //     await postSellOrder(gno, eth, 0, 5e18, seller2)
  //     await postSellOrder(eth, gno, 0, 10e18, seller1)
  //     const auctionIndex2 = await getAuctionIndex()
  //     assert.equal(auctionIndex2, 3)
  //     await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
  //     await postBuyOrder(gno, eth, auctionIndex + 1, totalBuyAmount, buyer1)

  //     // withdraw and check the balance change
  //     const [claimableAmtS1] = (await dx.claimTokensFromSeveralAuctionsAsSeller.call(
  //       [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller1))
  //       .map(result => {
  //         return result.map(value => value.toNumber())
  //       })
  //     const [claimableAmtS2] = (await dx.claimTokensFromSeveralAuctionsAsSeller.call(
  //       [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller2))
  //       .map(result => {
  //         return result.map(value => value.toNumber())
  //       })
  //     const claimedAmountsS1 = claimableAmtS1.reduce((acc, amount) => {
  //       return acc + amount
  //     }, 0)
  //     const claimedAmountsS2 = claimableAmtS2.reduce((acc, amount) => {
  //       return acc + amount
  //     }, 0)
  //     const seller1ETHBal = (await dx.balances.call(eth.address, seller1)).toNumber()
  //     const seller2ETHBal = (await dx.balances.call(eth.address, seller2)).toNumber()
  //     // Not deposited seller balances
  //     const seller1NotDepositedETHBal = (await eth.balanceOf.call(seller1)).toNumber()
  //     const seller2NotDepositedETHBal = (await eth.balanceOf.call(seller2)).toNumber()

  //     // claim claimable tokens and withdraw at same time
  //     await dx.claimAndWithdrawTokensFromSeveralAuctionsAsSeller(
  //       [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], { from: seller1 })
  //     await dx.claimAndWithdrawTokensFromSeveralAuctionsAsSeller(
  //       [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], { from: seller2 })

  //     // check that the sellerBalances is set to 0
  //     // assert that balance in DX of ETH + ClaimedAndWithdraw-n amount = correct amount
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //     assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
  //     assert.equal(seller1NotDepositedETHBal + claimedAmountsS1, (await eth.balanceOf.call(seller1)).toNumber())
  //     assert.equal(seller2NotDepositedETHBal + claimedAmountsS2, (await eth.balanceOf.call(seller2)).toNumber())
  //     // assert that claimed and withdrawed the amount (same deposited in DX)
  //     assert.equal(seller1ETHBal, (await dx.balances.call(eth.address, seller1)).toNumber())
  //     assert.equal(seller2ETHBal, (await dx.balances.call(eth.address, seller2)).toNumber())
  //   })
  // })

  const getSellerBalance = async (account, sellToken, buyToken, auctionIndex) =>
    (await dx.sellerBalances.call(sellToken.address || sellToken, buyToken.address || buyToken, auctionIndex, account))
      .toNumber()
})
