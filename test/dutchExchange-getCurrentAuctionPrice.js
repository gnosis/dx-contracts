/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */

const bn = require('bignumber.js')

const { 
  eventWatcher,
  logger,
  timestamp,
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx

let contracts

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


contract('DutchExchange - getCurrentAuctionPrice', (accounts) => {
  const [, seller1, , buyer1, buyer2] = accounts


  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10e18,
      0,
      2,
      1,
      { from: seller1 },
    )

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  it('1. check that getCurrentAuctionPrice returns the right value according to time for a normal running auction', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)

    const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
    const currenttime = timestamp()
    const [numPrevious, denPrevious] = (await dx.getPriceInPastAuction.call(eth.address, gno.address, auctionIndex - 1)).map(i => i.toNumber())
    const timeElapsed = currenttime - auctionStart 
    logger('numPrevious', numPrevious)
    logger('timeE', timeElapsed)
    assert.equal(num, bn((86400 - timeElapsed)).mul(numPrevious).toNumber())
    assert.equal(den, bn((timeElapsed + 43200)).mul(denPrevious).toNumber())
  })

  it('2. check that getCurrentAuctionPrice returns the right value (closing Price ) for a theoretical closed auction', async () => {
    const auctionIndex = await getAuctionIndex()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, 5 * 10e17, buyer1)
    await postBuyOrder(eth, gno, auctionIndex, 5 * 10e17, buyer2)
    // closing theoretical
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)
    
    // check prices:  - actually reduantant with tests postBuyOrder
    const closingPriceNum = (await dx.buyVolumes.call(eth.address, gno.address)).toNumber()
    const closingPriceDen = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
    assert.equal(closingPriceNum, num)
    assert.equal(closingPriceDen, den)
  })


  it('3. check that getCurrentAuctionPrice returns the (0,0) for future auctions', async () => {
    const auctionIndex = await getAuctionIndex()
    const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex + 1)).map(i => i.toNumber())
    assert.equal(0, num)
    assert.equal(0, den)
  })

  it('4. check that getCurrentAuctionPrice returns the right value (closing Price ) for a closed auction', async () => {
    const auctionIndex = await getAuctionIndex()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // clearning the auction
    await postBuyOrder(eth, gno, auctionIndex, 50 * 10e17, buyer2)
    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
    const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
    assert.equal(closingPriceNum, num)
    assert.equal(closingPriceDen, den)
  })
})
