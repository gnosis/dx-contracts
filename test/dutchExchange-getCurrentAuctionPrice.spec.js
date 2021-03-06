/* global contract, assert */
/* eslint no-undef: "error" */

const {
  BN,
  eventWatcher,
  log,
  timestamp
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder
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

contract('DutchExchange - getCurrentAuctionPrice', accounts => {
  const [master, seller1, , buyer1, buyer2] = accounts
  // Accounts to fund for faster setupTest
  const setupAccounts = [master, seller1, buyer1, buyer2]

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

  it('1. check that getCurrentAuctionPrice returns the right value according to time for a normal running auction', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    const { num, den } = await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)
    const currenttime = await timestamp()
    const { num: numPrevious, den: denPrevious } = await dx.getPriceInPastAuction.call(eth.address, gno.address, auctionIndex - 1)
    const timeElapsed = currenttime - auctionStart
    log('numPrevious', numPrevious)
    log('timeE', timeElapsed)
    assert.equal(num.toString(), (new BN((86400 - timeElapsed).toString())).mul(numPrevious).toString())
    assert.equal(den.toString(), (new BN((timeElapsed + 43200).toString())).mul(denPrevious).toString())
  })

  it('2. check that getCurrentAuctionPrice returns the right value (closing Price ) for a theoretical closed auction', async () => {
    const auctionIndex = await getAuctionIndex()

    await postBuyOrder(eth, gno, auctionIndex, 5.0.toWei(), buyer1)
    await postBuyOrder(eth, gno, auctionIndex, 5.0.toWei(), buyer2)
    // closing theoretical
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)

    // check prices:  - actually reduantant with tests postBuyOrder
    const closingPriceNum = await dx.buyVolumes.call(eth.address, gno.address)
    const closingPriceDen = await dx.sellVolumesCurrent.call(eth.address, gno.address)
    const { num, den } = await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)
    assert.equal(closingPriceNum.toString(), num.toString())
    assert.equal(closingPriceDen.toString(), den.toString())
  })

  it('3. check that getCurrentAuctionPrice returns the (0,0) for future auctions', async () => {
    const auctionIndex = await getAuctionIndex()
    const { num, den } = await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex + 1)
    assert.equal(0, num)
    assert.equal(0, den)
  })

  it('4. check that getCurrentAuctionPrice returns the right value (closing Price ) for a closed auction', async () => {
    const auctionIndex = await getAuctionIndex()

    // clearning the auction
    await postBuyOrder(eth, gno, auctionIndex, 5.0.toWei(), buyer2)
    const { num: closingPriceNum, den: closingPriceDen } = await dx.closingPrices.call(eth.address, gno.address, auctionIndex)
    const { num, den } = await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)
    assert.equal(closingPriceNum.toString(), num.toString())
    assert.equal(closingPriceDen.toString(), den.toString())
  })
})
