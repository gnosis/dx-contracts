/* global contract, assert */

const {
  BN,
  BN_ZERO,
  ETH_10_WEI,
  ETH_20_WEI,
  toEth,
  makeSnapshot,
  revertSnapshot,
  valMinusFee
} = require('./utils')

const {
  getContracts,
  setupTest,
  postBuyOrder,
  postSellOrder,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
let dxh

let contracts

const setupContracts = async () => {
  contracts = await getContracts({ resetCache: true });
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    DutchExchangeHelper: dxh,
    EtherToken: eth,
    TokenGNO: gno
  } = contracts)
}

contract('DutchExchange - Helper', accounts => {
  const [master, buyer1, seller1] = accounts
  // Accounts to fund for faster setupTest
  const setupAccounts = [master, buyer1, seller1]

  const startBal = {
    startingETH: 100.0.toWei(),
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1008.0.toWei(),
    sellingAmount: 50.0.toWei()
  }

  before(async () => {
    // get contracts
    await setupContracts()

    await setupTest(setupAccounts, contracts, startBal)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      ETH_10_WEI,
      0,
      2,
      1,
      { from: seller1 }
    )

    await setAndCheckAuctionStarted(eth, gno)

    // eventWatcher(dx, 'Log')
  })

  let currentSnapshotId

  beforeEach(async () => {
    currentSnapshotId = await makeSnapshot()
  })

  afterEach(async () => {
    await revertSnapshot(currentSnapshotId)
  })

  it('1. check that getRunningTokenPairs returns the right token pairs', async () => {
    // GIVEN a running auction
    // WHEN we query for the running token pairs
    const runningTokenPairs = await dxh.getRunningTokenPairs([eth.address, gno.address])

    // THEN we can assert we receive the expected running token pairs
    assert.include(runningTokenPairs.tokens1, eth.address)
    assert.include(runningTokenPairs.tokens2, gno.address)
  })

  // FIXME if we pass lastNAuctions greater than auctionIndex we get an overflow
  it('2. check that getIndicesWithClaimableTokensForSellers returns the right indices', async () => {
    // GIVEN a running auction where seller1 participated as seller
    // WHEN we check for indices with claimable tokens for sellers
    const auctionIndex = await getAuctionIndex()
    // FIXME this won't return the expected value
    // let claimableIndicesForSeller = await dxh.getIndicesWithClaimableTokensForSellers(
    //   eth.address, gno.address, seller1, new BN('5'))
    let claimableIndicesForSeller = await dxh.getIndicesWithClaimableTokensForSellers(
      eth.address, gno.address, seller1, new BN('0'))

    // THEN claimable tokens for sellers is returned even that the auction didn't close
    // Check 1 auction is returned before closing
    assert.lengthOf(claimableIndicesForSeller.indices, 1)
    assert.lengthOf(claimableIndicesForSeller.usersBalances, 1)

    // Check that include expected values before closing
    let stringClaimableIndices = claimableIndicesForSeller.indices
      .map(i => i.toString())
    let stringClaimableBalances = claimableIndicesForSeller.usersBalances
      .map(balance => balance.toString())
    assert.include(stringClaimableIndices, '1')
    assert.include(stringClaimableBalances, valMinusFee(ETH_10_WEI).toString())

    // Closing auction 1
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, ETH_20_WEI, buyer1)

    claimableIndicesForSeller = await dxh.getIndicesWithClaimableTokensForSellers(
      eth.address, gno.address, seller1, new BN('0'))
    // Check 1 auction is returned before closing
    assert.lengthOf(claimableIndicesForSeller.indices, 1)
    assert.lengthOf(claimableIndicesForSeller.usersBalances, 1)

    // Check that include expected values before closing
    stringClaimableIndices = claimableIndicesForSeller.indices.map(i => i.toString())
    stringClaimableBalances = claimableIndicesForSeller.usersBalances.map(balance => balance.toString())
    assert.include(stringClaimableIndices, '1')
    assert.include(stringClaimableBalances, valMinusFee(ETH_10_WEI).toString())
  })

  it('3. check that getSellerBalancesOfCurrentAuctions returns the right seller balance before closing the auction', async () => {
    // GIVEN a running auction where seller1 participated as a seller
    // WHEN we check for seller balance of current auction
    const sellerBalance = await dxh.getSellerBalancesOfCurrentAuctions(
      [eth.address], [gno.address], seller1)

    // THEN we get the expected value of seller balance for that auction
    assert.lengthOf(sellerBalance, 1)
    const stringSellerBalance = sellerBalance.map(balance => balance.toString())
    assert.include(stringSellerBalance, valMinusFee(ETH_10_WEI).toString())
  })

  it('4. check that getSellerBalancesOfCurrentAuctions returns the right seller balance after closing the auction', async () => {
    // GIVEN a running auction where seller1 participated as a seller
    const auctionIndex = await getAuctionIndex()
    let sellerBalance = await dxh.getSellerBalancesOfCurrentAuctions(
      [eth.address], [gno.address], seller1)

    assert.lengthOf(sellerBalance, 1)
    let stringSellerBalance = sellerBalance.map(balance => balance.toString())
    assert.include(stringSellerBalance, valMinusFee(ETH_10_WEI).toString())

    // WHEN we post a buy order and close the auction
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, ETH_20_WEI, buyer1)

    // THEN we get the expected value of seller balance for the next auction
    sellerBalance = await dxh.getSellerBalancesOfCurrentAuctions(
      [eth.address], [gno.address], seller1)

    assert.lengthOf(sellerBalance, 1)
    stringSellerBalance = sellerBalance.map(balance => balance.toString())
    assert.include(stringSellerBalance, BN_ZERO.toString())
  })

  it('5. check that getIndicesWithClaimableTokensForBuyers returns the right indices', async () => {
    // GIVEN a running token pair auction where the buyer1 hasn't participated
    const auctionIndex = await getAuctionIndex()
    let claimableIndicesForBuyer = await dxh.getIndicesWithClaimableTokensForBuyers(
      eth.address, gno.address, buyer1, new BN('0'))
    assert.lengthOf(claimableIndicesForBuyer.indices, 0)

    // WHEN we post a buy order and close the auction
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, ETH_20_WEI, buyer1)

    // THEN the buyer1 has auctions with claimable tokens as a buyer
    claimableIndicesForBuyer = await dxh.getIndicesWithClaimableTokensForBuyers(
      eth.address, gno.address, buyer1, new BN('0'))

    // Check 1 auction is returned
    assert.lengthOf(claimableIndicesForBuyer.indices, 1)
    assert.lengthOf(claimableIndicesForBuyer.usersBalances, 1)

    // Check that include expected values
    const stringClaimableIndices = claimableIndicesForBuyer.indices
      .map(i => i.toString())
    const difference = toEth(valMinusFee(ETH_20_WEI)
      .sub(claimableIndicesForBuyer.usersBalances[0]))
    assert.include(stringClaimableIndices, '1')
    assert.isAtMost(parseFloat(difference), 0.005)
  })

  it('6. check that getBuyerBalancesOfCurrentAuctions returns the right buyer balance before closing the auction', async () => {
    const auctionIndex = await getAuctionIndex()
    // GIVEN a running auction where buyer1 has not yet participated as a buyer
    let buyerBalance = await dxh.getBuyerBalancesOfCurrentAuctions(
      [eth.address], [gno.address], buyer1)
    assert.lengthOf(buyerBalance, 1)
    let stringBuyerBalance = buyerBalance.map(balance => balance.toString())
    assert.include(stringBuyerBalance, BN_ZERO.toString())

    // WHEN we post a buy order and we don't close the auction
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    await postBuyOrder(eth, gno, auctionIndex, ETH_10_WEI, buyer1)

    // THEN we get the expected value of buyer balance for that auction
    buyerBalance = await dxh.getBuyerBalancesOfCurrentAuctions(
      [eth.address], [gno.address], buyer1)
    assert.lengthOf(buyerBalance, 1)
    stringBuyerBalance = buyerBalance.map(balance => balance.toString())
    assert.include(stringBuyerBalance, valMinusFee(ETH_10_WEI).toString())
  })

  it('7. check that getBuyerBalancesOfCurrentAuctions returns the right buyer balance after closing the auction', async () => {
    const auctionIndex = await getAuctionIndex()
    // GIVEN a running auction where buyer1 has not yet participated as a buyer
    let buyerBalance = await dxh.getBuyerBalancesOfCurrentAuctions(
      [eth.address], [gno.address], buyer1)
    assert.lengthOf(buyerBalance, 1)
    let stringBuyerBalance = buyerBalance.map(balance => balance.toString())
    assert.include(stringBuyerBalance, BN_ZERO.toString())

    // WHEN we post a buy order and we close the auction
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, ETH_20_WEI, buyer1)

    // THEN we get the expected value of buyer balance for the next auction
    buyerBalance = await dxh.getBuyerBalancesOfCurrentAuctions(
      [eth.address], [gno.address], buyer1)
    assert.lengthOf(buyerBalance, 1)
    stringBuyerBalance = buyerBalance.map(balance => balance.toString())
    assert.include(stringBuyerBalance, BN_ZERO.toString())
  })
})
