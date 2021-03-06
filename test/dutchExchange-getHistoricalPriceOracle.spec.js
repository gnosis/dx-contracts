/* global contract, assert */
/* eslint no-undef: "error" */

const {
  BN_ZERO,
  eventWatcher,
  assertRejects,
  gasLogger
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
  postSellOrder
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx

let contracts

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
  startingETH: 90.0.toWei(),
  startingGNO: 90.0.toWei(),
  ethUSDPrice: 1008.0.toWei(),
  sellingAmount: 50.0.toWei() // Same as web3.toWei(50, 'ether')
}

contract('DutchExchange - getPriceInPastAuction', accounts => {
  const [master, seller1, seller2, buyer1] = accounts
  // Accounts to fund for faster setupTest
  const setupAccounts = [master, seller1, seller2, buyer1]

  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(setupAccounts, contracts, startBal)

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

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)
  afterEach(gasLogger)

  it('0. throws for auctionIndex == 0', async () => {
    await assertRejects(dx.getPriceInPastAuction.call(gno.address, 0))
  })

  it('1. check that price for ETH is (1,1)', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    const { num, den } = await dx.getPriceInPastAuction.call(
      eth.address, eth.address, auctionIndex - 1)

    assert.equal(num, 1)
    assert.equal(den, 1)
  })

  it('2. check that price is correct for closingPriceToken.num == 0', async () => {
    let auctionIndex = await getAuctionIndex()

    // closing auction
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, 20.0.toWei(), buyer1)

    // check that auction acutally closed
    auctionIndex = await getAuctionIndex()
    assert.equal(2, auctionIndex)

    // checking that closingPriceToken.num == 0
    const { num: closingPriceNumToken } = await dx.closingPrices.call(
      gno.address, eth.address, auctionIndex - 1)
    assert.equal(closingPriceNumToken, 0)

    // actual testing
    const { num: closingPriceNum, den: closingPriceDen } = await dx.closingPrices.call(
      eth.address, gno.address, auctionIndex - 1)
    const { num, den } = await dx.getPriceInPastAuction.call(
      eth.address, gno.address, auctionIndex - 1)
    // We need to check the inverse closingPrices, since we have eth, gno prices
    assert.equal(closingPriceNum.toString(), num.toString())
    assert.equal(closingPriceDen.toString(), den.toString())
  })

  // TODO review: this state is not possible any more since both auction sides should be funded
  it.skip('3. check that price is correct for closingPriceETH.num == 0', async () => {
    let auctionIndex = await getAuctionIndex()

    // prepare test by starting and clearing new auction
    await postSellOrder(gno, eth, 0, 10.0.toWei(), seller2)
    await waitUntilPriceIsXPercentOfPreviousPrice(gno, eth, 1)
    await postBuyOrder(gno, eth, auctionIndex, 20.0.toWei(), buyer1)

    // check that auction acutally closed
    auctionIndex = await getAuctionIndex()
    assert.equal(3, auctionIndex)

    // checking that closingPriceETH.num == 0
    const [closingPriceNumToken] = (await dx.closingPrices.call(
      eth.address, gno.address, auctionIndex - 1)).map(i => i.toNumber())
    assert.equal(closingPriceNumToken, 0)

    // actual testing
    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices.call(
      gno.address, eth.address, auctionIndex - 1)).map(i => i.toNumber())
    const [num, den] = (await dx.getPriceInPastAuction.call(
      eth.address, gno.address, auctionIndex - 1)).map(i => i.toNumber())
    assert.equal(closingPriceDen, num)
    assert.equal(closingPriceNum, den)
  })

  it('4. check that price returns the averaged price by volume, if both previous volumes > 0 ', async () => {
    let auctionIndex = await getAuctionIndex()
    // start new auctions
    await postSellOrder(gno, eth, 0, 10.0.toWei(), seller2)
    await postSellOrder(eth, gno, 0, 10.0.toWei(), seller2)

    // clear new auctions
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(gno, eth, auctionIndex, 20.0.toWei(), buyer1)
    await postBuyOrder(eth, gno, auctionIndex, 20.0.toWei(), buyer1)

    // check that auction actually closed
    auctionIndex = await getAuctionIndex()
    assert.equal(3, auctionIndex)

    const { num: closingPriceNum, den: closingPriceDen } = await dx.closingPrices.call(
      eth.address, gno.address, auctionIndex - 1)
    const { num: closingPriceNumOpp, den: closingPriceDenOpp } = await dx.closingPrices.call(
      gno.address, eth.address, auctionIndex - 1)
    const { num, den } = await dx.getPriceInPastAuction.call(
      eth.address, gno.address, auctionIndex - 1)

    // check that the tests is in correct state:
    assert.equal(closingPriceNum.gt(BN_ZERO), true)
    assert.equal(closingPriceNumOpp.gt(BN_ZERO), true)

    // checks for the actual test
    assert.equal(closingPriceNum.add(closingPriceDenOpp).toString(), num.toString())
    assert.equal(closingPriceDen.add(closingPriceNumOpp).toString(), den.toString())
  })
})
