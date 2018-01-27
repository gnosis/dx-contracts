/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */

const bn = require('bignumber.js')

const { 
  eventWatcher,
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
  postSellOrder,
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


contract('DutchExchange - historicalPriceOracleForJS', (accounts) => {
  const [, seller1, seller2, buyer1] = accounts


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

  it('1. check that price for ETH is (1,1)', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    const [num, den] = (await dx.historicalPriceOracleForJS(eth.address, auctionIndex)).map(i => i.toNumber())

    assert.equal(num, 1)
    assert.equal(den, 1)
  })

  it(' 2. check that price is correct for closingPriceToken.num == 0', async () => {
    let auctionIndex = await getAuctionIndex()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    
    // closing auction
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, 2 * 10e18, buyer1)

    // check that auction acutally closed
    auctionIndex = await getAuctionIndex()
    assert.equal(2, auctionIndex)

    // checking that closingPriceToken.num == 0
    const [closingPriceNumToken] = (await dx.closingPrices(gno.address, eth.address, auctionIndex - 1)).map(i => i.toNumber())
    assert.equal(closingPriceNumToken, 0)

    // actual testing
    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices(eth.address, gno.address, auctionIndex - 1)).map(i => i.toNumber())
    const [num, den] = (await dx.historicalPriceOracleForJS(gno.address, auctionIndex)).map(i => i.toNumber())
    // We need to check the inverse closingPrices, since we have eth, gno prices
    assert.equal(closingPriceDen, num)
    assert.equal(closingPriceNum, den)
  })


  it('3. check that price is correct for closingPriceToken.num == 0', async () => {
    let auctionIndex = await getAuctionIndex()

    // prepare test by starting and clearning new auction
    await postSellOrder(gno, eth, 0, 10e18, seller2)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(gno, eth, auctionIndex, 2 * 10e18, buyer1)
    
    // check that auction acutally closed
    auctionIndex = await getAuctionIndex()
    assert.equal(3, auctionIndex)

    // checking that closingPriceToken.num == 0
    const [closingPriceNumToken] = (await dx.closingPrices(eth.address, gno.address, auctionIndex - 1)).map(i => i.toNumber())
    assert.equal(closingPriceNumToken, 0)
    
    // actual testing
    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices(gno.address, eth.address, auctionIndex - 1)).map(i => i.toNumber())
    const [num, den] = (await dx.historicalPriceOracleForJS(gno.address, auctionIndex)).map(i => i.toNumber())
    assert.equal(closingPriceNum, num)
    assert.equal(closingPriceDen, den)
  })

  it('4. check that price returns the averaged price by volume, if both previous volumes >0 ', async () => {
    let auctionIndex = await getAuctionIndex()
    // start new auctions
    await postSellOrder(gno, eth, 0, 10e17, seller2)
    await postSellOrder(eth, gno, 0, 10e18, seller2)
    
    // clear new auctions
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(gno, eth, auctionIndex, 2 * 10e18, buyer1)
    await postBuyOrder(eth, gno, auctionIndex, 2 * 10e18, buyer1)

    // check that auction acutally closed
    auctionIndex = await getAuctionIndex()
    assert.equal(4, auctionIndex)

    const [closingPriceNum, closingPriceDen] = (await dx.closingPrices(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
    const [closingPriceNumOpp, closingPriceDenOpp] = (await dx.closingPrices(gno.address, eth.address, auctionIndex)).map(i => i.toNumber())
    const [num, den] = (await dx.getPriceForJS(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
    // closingPriceETH.den ** 2 * closingPriceToken.den + closingPriceToken.num ** 2 * closingPriceETH.num;
    // closingPriceETH.num * closingPriceToken.den * (closingPriceETH.den + closingPriceToken.num);
    assert.equal(bn(closingPriceDen).mul(bn(closingPriceDen)).mul(bn(closingPriceDenOpp)).add(bn(closingPriceNumOpp).mul(bn(closingPriceNumOpp)).mul(bn(closingPriceNum))), num)
    assert.equal(bn(closingPriceNum).mul(closingPriceDenOpp).mul(bn(closingPriceDen).add(closingPriceNumOpp)), den)
  })
})
