/* global contract, assert */
/* eslint no-undef: "error" */

/* Fee Reduction Token issuing is tested seperately in dutchExchange-MGN.js */

const {
  AUCTION_START_WAITING_FOR_FUNDING,
  BN,
  BN_ZERO,
  eventWatcher,
  log: utilsLog,
  gasLogger,
  makeSnapshot,
  revertSnapshot,
  toEth,
  timestamp
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
let contracts, eth, gno, dx, oracle
let usdEthPrice, amountEthBelowThreshold, amountEthAboveThreshold, amountGnoBelowTheshold, amountGnoAboveThreshold

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
    dx.thresholdNewAuction().then(bn => parseInt(toEth(bn))),
    oracle.getUSDETHPrice.call().then(bn => bn.toNumber()),
    dx.getPriceOfTokenInLastAuction.call(gno.address).then(({ num, den }) => num.toNumber() / den.toNumber())
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
    snapshotId = await makeSnapshot()
  })

  afterEach(gasLogger)
  afterEach(async () => {
    // log('Revert snapshot of Ganache')
    await revertSnapshot(snapshotId)
    snapshotId = await makeSnapshot()
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

  it(`2. doesn't start if we surplus one of the sides`, async () => {
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
    const now = await timestamp()
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
    const now = await timestamp()
    log(`Posting sell order above threshold --> WETH-GNO-${auctionIndex}: ${amountEthAboveThreshold}`)
    await postSellOrder(eth, gno, auctionIndex, amountEthAboveThreshold.toWei(), seller1)

    // WHEN: 24h goes by
    await wait(SECONDS_24H)

    // WHEN: A seller "poke" the contract
    await postSellOrder(eth, gno, auctionIndex, BN_ZERO, seller1)

    // THEN: The auction is scheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, now, 'The auction should be scheduled to start')
  })

  it(`6. starts if there is enough funding in the opposite side and 24h goes by`, async () => {
    // GIVEN: Auction 2
    // GIVEN: waiting for funding
    // GIVEN: No sell volume
    //  Checked already in 1.

    // WHEN: We surplus the opposite side
    const auctionIndex = await getAuctionIndex(eth, gno)
    const now = await timestamp()
    log(`Posting sell order above threshold --> GNO-WETH-${auctionIndex}: ${amountGnoAboveThreshold}`)
    await postSellOrder(gno, eth, auctionIndex, amountGnoAboveThreshold.toWei(), seller1)

    // WHEN: 24h goes by
    await wait(SECONDS_24H)

    // WHEN: A seller "poke" the contract
    await postSellOrder(eth, gno, auctionIndex, BN_ZERO, seller1)

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
    const now = await timestamp()
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
    const now = await timestamp()
    log(`Posting sell order above threshold --> GNO-WETH-${auctionIndex}: ${amountGnoAboveThreshold}`)
    await postSellOrder(gno, eth, auctionIndex, amountGnoAboveThreshold.toWei(), seller1)

    // THEN: The auction is scheduled
    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, now, 'The auction should be scheduled to start')
  })

  const getSellerBalance = async (account, sellToken, buyToken, auctionIndex) =>
    (await dx.sellerBalances.call(sellToken.address || sellToken, buyToken.address || buyToken, auctionIndex, account))
      .toNumber()
})
