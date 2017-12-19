/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0 */

const DutchExchange = artifacts.require('DutchExchange')
const EtherToken = artifacts.require('EtherToken')
const PriceOracle = artifacts.require('PriceOracle')
const TokenGNO = artifacts.require('TokenGNO')
// const MathSol = artifacts.require('Math')
// const StandardToken = artifacts.require('StandardToken')
// const Token = artifacts.require('./Token.sol')
// const OWL = artifacts.require('OWL')

const { timestamp, blockNumber } = require('./utils')

const { wait } = require('@digix/tempo')(web3)

const MaxRoundingError = 100

// Test VARS
let eth
let gno
let dx
let oracle

// testing Auction Functions
const setupTest = async (accounts) => {
  // get buyers, sellers set up and running
  gno = await TokenGNO.deployed()
  eth = await EtherToken.deployed()
  // create dx
  dx = await DutchExchange.deployed()
  // create price Oracle
  oracle = await PriceOracle.deployed()

  for (let acct = 1; acct < accounts.length; acct++) {
    await Promise.all([
      eth.deposit({ from: accounts[acct], value: 10 ** 9 }),
      eth.approve(dx.address, 10 ** 9, { from: accounts[acct] }),
      gno.transfer(accounts[acct], 10 ** 18, { from: accounts[0] }),
      gno.approve(dx.address, 10 ** 18, { from: accounts[acct] }),
    ])
    await Promise.all([
      dx.deposit(eth.address, 10 ** 9, { from: accounts[acct] }),
      dx.deposit(gno.address, 10 ** 18, { from: accounts[acct] }),
    ])
  }

  // add token Pair
  // updating the oracle Price. Needs to be changed later to another mechanism
  await oracle.updateETHUSDPrice(60000)
}

const setAndCheckAuctionStarted = async (ST, BT) => {
  const startingTimeOfAuction = (await dx.auctionStarts.call(ST.address, BT.address)).toNumber()

  // wait for the right time to send buyOrder
  await wait(startingTimeOfAuction - timestamp() )
  assert.equal(timestamp() >= startingTimeOfAuction, true)
}
// @param p is the percentage of the previous price 
const waitUntilPriceIsXPercentOfPreviousPrice = async (ST, BT, p) => {
  const startingTimeOfAuction = (await dx.auctionStarts.call(ST.address, BT.address)).toNumber()
  const timeToWaitFor = (86400-p*43200)/(1+p)+startingTimeOfAuction
  // wait until the price is good
  await wait(timeToWaitFor- timestamp())
  assert.equal(timestamp() >= timeToWaitFor, true)
}

/**
 * checkBalanceBeforeClaim
 * @param {string} acct       => acct to check Balance of
 * @param {number} idx        => auctionIndex to check
 * @param {string} claiming   => 'seller' || 'buyer'
 * @param {string} sellToken  => gno || eth
 * @param {string} buyToken   => gno || eth
 * @param {number} amt        => amt to check
 * @param {number} round      => rounding error threshold
 */
const checkBalanceBeforeClaim = async (
  acct,
  idx,
  claiming,
  sellToken = eth,
  buyToken = gno,
  amt = (10 ** 9),
  round = MaxRoundingError
) => {
  if (claiming === 'buyer') {
    // const auctionIndex = await getAuctionIndex()
    const balanceBeforeClaim = (await dx.balances.call(sellToken.address, acct)).toNumber()
    await dx.claimBuyerFunds(sellToken.address, buyToken.address, acct, idx)
    assert.equal(balanceBeforeClaim + amt - (await dx.balances.call(sellToken.address, acct)).toNumber() < round, true)
  } else {
    const balanceBeforeClaim = (await dx.balances.call(buyToken.address, acct)).toNumber()
    await dx.claimSellerFunds(sellToken.address, buyToken.address, acct, idx)
    assert.equal(balanceBeforeClaim + amt - (await dx.balances.call(buyToken.address, acct)).toNumber() < round, true)
  }
}

const getAuctionIndex = async (sell = eth, buy = gno) => (await dx.latestAuctionIndices.call(sell.address, buy.address)).toNumber()
const getStartingTimeOfAuction = async (sell = eth, buy = gno) => (await dx.auctionStarts.call(sell.address, buy.address)).toNumber()

contract('DutchExchange', (accounts) => {
  const [, seller1, , buyer1] = accounts

  beforeEach(async () => {
    // set up accounts and tokens
    await setupTest(accounts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 }
    )
  })

  it('Buys tokens at the 2:1 price', async () => {
    const auctionIndex = await getAuctionIndex()

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    // wait until price is good
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // buy
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer1 })

    /* -- claim Buyerfunds - function does this:
    * 1. balanceBeforeClaim = (await dx.balances.call(eth.address, buyer1)).toNumber()
    * 2. await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
    * 3. assert.equal(balanceBeforeClaim + 10 ** 9 - (await dx.balances.call(eth.address, buyer1)).toNumber() < MaxRoundingError, true)
    */
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer')

    // claim Sellerfunds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 9 / 2))
  })
})

contract('DutchExchange', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2] = accounts

  beforeEach(async () => {
    // set up accounts and tokens
    await setupTest(accounts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 }
    )
  })

  it('process two auctions one after the other in one pair only', async () => {
    let auctionIndex

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)

    auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer1 })

    // check Buyer1 balance and claim
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer')
    // check Seller1 Balance
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller')

    // post new sell order to start next auction
    auctionIndex = await getAuctionIndex()
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 ** 9, { from: seller2 })

    await setAndCheckAuctionStarted(eth, gno)

    auctionIndex = await getAuctionIndex()
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })

  })
})

contract('DutchExchange', (accounts) => {

  const [, seller1, seller2, buyer1, buyer2] = accounts

  beforeEach(async () => {
    // set up accounts and tokens
    await setupTest(accounts)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      10 ** 8 * 5,
      2,
      1,
      { from: seller1 }
    )
  })

  it('test a trade on the opposite pair', async () => {

    let auctionIndex

    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)
    auctionIndex = await getAuctionIndex()

    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer1 })
    await dx.postBuyOrder(gno.address, eth.address, auctionIndex, 10 ** 7 * 25, { from: seller2 })

    // claim buyer1 BUYER funds
    await checkBalanceBeforeClaim(buyer1, auctionIndex, 'buyer')
    // claim seller2 BUYER funds - RECIPROCAL
    await checkBalanceBeforeClaim(seller2, auctionIndex, 'buyer', gno, eth, (10 ** 8 * 5))
    // claim SELLER funds
    await checkBalanceBeforeClaim(seller1, auctionIndex, 'seller', eth, gno, (10 ** 9 / 2))

    // post new sell order to start next auction
    // startingTimeOfAuction = await getStartingTimeOfAuction(eth, gno)
    auctionIndex = await getAuctionIndex()
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, 10 ** 9, { from: seller2 })

    // check Auction has started
    await setAndCheckAuctionStarted(eth, gno)

    auctionIndex = await getAuctionIndex()
    await dx.postBuyOrder(eth.address, gno.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })
  })
})


/*
  const checkConstruction = async function () {
    // initial price is set
    let initialClosingPrice = await dx.closingPrices(0);
    initialClosingPrice = initialClosingPrice.map(x => x.toNumber());
    assert.deepEqual(initialClosingPrice, [2, 1], 'initialClosingPrice set correctly');

    // sell token is set
    const exchangeSellToken = await dx.sellToken();
    assert.equal(exchangeSellToken, sellToken.address, 'sellToken set correctly');

    // buy token is set
    const exchangeBuyToken = await dx.buyToken();
    assert.equal(exchangeBuyToken, buyToken.address, 'buyToken set correctly');

    // TUL token is set
    const exchangeTUL = await dx.TUL();
    assert.equal(exchangeTUL, TUL.address, 'TUL set correctly');

    // next auction is scheduled correctly
    await nextAuctionScheduled();
  }

  const approveAndSell = async function (amount) {
    const sellerBalancesBefore = (await dx.sellerBalances(1, seller)).toNumber();
    const sellVolumeBefore = (await dx.sellVolumeCurrent()).toNumber();

    await sellToken.approve(dxa, amount, { from: seller });
    await dx.postSellOrder(amount, { from: seller });

    const sellerBalancesAfter = (await dx.sellerBalances(1, seller)).toNumber();
    const sellVolumeAfter = (await dx.sellVolumeCurrent()).toNumber();

    assert.equal(sellerBalancesBefore + amount, sellerBalancesAfter, 'sellerBalances updated');
    assert.equal(sellVolumeBefore + amount, sellVolumeAfter, 'sellVolume updated');
  }

  const postSellOrders = async function () {
    await utils.assertRejects(approveAndBuy(50));
    await approveAndSell(50);
    await approveAndSell(50);
  }

  const approveAndBuy = async function (amount) {
    const buyerBalancesBefore = (await dx.buyerBalances(1, buyer)).toNumber();
    const buyVolumeBefore = (await dx.buyVolumes(1)).toNumber();

    await buyToken.approve(dxa, amount, { from: buyer });
    const price = (await dx.getPrice(1)).map(x => x.toNumber());

    await dx.postBuyOrder(amount, 1, { from: buyer });

    const buyerBalancesAfter = (await dx.buyerBalances(1, buyer)).toNumber();
    const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();

    assert.equal(buyerBalancesBefore + amount, buyerBalancesAfter, 'buyerBalances updated');
    assert.equal(buyVolumeBefore + amount, buyVolumeAfter, 'buyVolumes updated');
  }

  const approveBuyAndClaim = async function (amount) {
    const claimedAmountBefore = (await dx.claimedAmounts(1, buyer)).toNumber();
    const buyerBalancesBefore = (await dx.buyerBalances(1, buyer)).toNumber();
    const buyVolumeBefore = (await dx.buyVolumes(1)).toNumber();

    await buyToken.approve(dxa, amount, { from: buyer });
    const price = (await dx.getPrice(1)).map(x => x.toNumber());
    await dx.postBuyOrderAndClaim(amount, 1, { from: buyer });

    const claimedAmountAfter = (await dx.claimedAmounts(1, buyer)).toNumber();
    const buyerBalancesAfter = (await dx.buyerBalances(1, buyer)).toNumber();
    const expectedReturn = Math.floor(buyerBalancesAfter * price[1] / price[0]) - claimedAmountBefore;
    const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();

    assert.equal(expectedReturn + claimedAmountBefore, claimedAmountAfter, 'claimedAmounts updated');
    assert.equal(buyerBalancesBefore + amount, buyerBalancesAfter, 'buyerBalances updated');
    assert.equal(buyVolumeAfter, buyVolumeBefore + amount, 'buyVolumes updated');
  }

  const postBuyOrdersAndClaim = async function () {
    await approveAndBuy(50);
    await approveBuyAndClaim(25);
    await utils.assertRejects(approveAndSell(50));
    await auctionStillRunning();
  }

  const auctionStillRunning = async function () {
    const auctionIndex = (await dx.auctionIndex()).toNumber();
    assert.equal(auctionIndex, 1, 'auction index same');
  }

  const startAuction = async function () {
    const exchangeStart = (await dx.auctionStart()).toNumber();
    const now = (await dx.now()).toNumber();
    const timeUntilStart = exchangeStart - now;
    await dx.increaseTimeBy(1, timeUntilStart);
  }

  const runThroughAuctionBeforeClear = async function () {
    await checkConstruction();
    await postSellOrders();

    await startAuction();
    await postBuyOrdersAndClaim();
  }

  const clearAuctionWithTime = async function () {
    const buyVolume = (await dx.buyVolumes(1)).toNumber();
    const sellVolume = (await dx.sellVolumeCurrent()).toNumber();
    const auctionStart = (await dx.auctionStart()).toNumber();

    // Auction clears when sellVolume * price = buyVolume
    // Since price is a function of time, so we have to rearrange the equation for time, which gives
    timeWhenAuctionClears = Math.ceil(72000 * sellVolume / buyVolume - 18000 + auctionStart);
    await dx.setTime(timeWhenAuctionClears);
    const buyerBalance = (await dx.buyerBalances(1, buyer)).toNumber();

    await buyToken.approve(dxa, 1, { from: buyer });
    await dx.postBuyOrder(1, 1, { from: buyer });

    const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();
    const buyerBalanceAfter = (await dx.buyerBalances(1, buyer)).toNumber();

    // Nothing has been updated
    assert.equal(buyVolume, buyVolumeAfter, 'buyVolume constant');
    assert.equal(buyerBalance, buyerBalanceAfter, 'buyerBalance constant');

    // New auction has been scheduled
    await auctionCleared();
  }

  const clearAuctionWithBuyOrder = async function () {
    const buyerBalanceBefore = (await dx.buyerBalances(1, buyer)).toNumber();
    const buyVolumeBefore = (await dx.buyVolumes(1)).toNumber();
    const sellVolume = (await dx.sellVolumeCurrent()).toNumber();
    const auctionStart = (await dx.auctionStart()).toNumber();
    const price = (await dx.getPrice(1)).map(x => x.toNumber());

    // Auction clears when sellVolume * price = buyVolume
    // Solidity rounds down, so slightly less is required
    const amountToClearAuction = Math.floor(sellVolume * price[0] / price[1]) - buyVolumeBefore;
    // Let's add a little overflow to see if it handles it
    const amount = amountToClearAuction + 10;

    // It should subtract it before transferring

    await buyToken.approve(dxa, amount, { from: buyer });
    await dx.postBuyOrder(amount, 1, { from: buyer });

    const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();
    const buyerBalanceAfter = (await dx.buyerBalances(1, buyer)).toNumber();

    assert.equal(buyVolumeBefore + amountToClearAuction, buyVolumeAfter, 'buyVolume updated');
    assert.equal(buyerBalanceBefore + amountToClearAuction, buyerBalanceAfter, 'buyerBalances updated');

    // New auction has been scheduled
    await auctionCleared();
  }

  const claimBuyerFunds = async function () {
    const buyerBalance = (await dx.buyerBalances(1, buyer)).toNumber();
    const claimedAmountBefore = (await dx.claimedAmounts(1, buyer)).toNumber();

    await dx.claimBuyerFunds(1, { from: buyer });

    // Calculate returned value
    const price = (await dx.getPrice(1)).map(x => x.toNumber());
    const returned = Math.floor(buyerBalance * price[1] / price[0]) - claimedAmountBefore;
    const claimedAmountAfter = (await dx.claimedAmounts(1, buyer)).toNumber();

    assert.equal(claimedAmountBefore + returned, claimedAmountAfter, 'claimedAmount updated');

    // Follow-up claims should fail
    utils.assertRejects(dx.claimBuyerFunds(1, { from: buyer }));
  }

  const claimSellerFunds = async function () {
    const sellerBalance = (await dx.sellerBalances(1, seller)).toNumber();

    const claimReceipt = await dx.claimSellerFunds(1, { from: seller });

    const returned = claimReceipt.logs[0].args._returned.toNumber();

    const price = (await dx.getPrice(1)).map(x => x.toNumber());
    const expectedReturn = Math.floor(sellerBalance * price[0] / price[1]);
    assert.equal(expectedReturn, returned, 'returned correct amount');

    // Follow-up claims should fail
    utils.assertRejects(dx.claimSellerFunds(1, { from: seller }));
  }

  const auctionCleared = async function () {
    // Get exchange variables
    const price = (await dx.getPrice(1)).map(x => x.toNumber());
    const closingPrice = (await dx.closingPrices(1)).map(x => x.toNumber());
    const sellVolumeCurrent = (await dx.sellVolumeCurrent()).toNumber();
    const sellVolumeNext = (await dx.sellVolumeNext()).toNumber();
    const auctionIndex = (await dx.auctionIndex()).toNumber();

    // Variables have been updated
    assert.deepEqual(closingPrice, price);
    assert.equal(sellVolumeCurrent, 0);
    assert.equal(sellVolumeNext, 0);
    assert.equal(auctionIndex, 2);

    // Next auction scheduled
    await nextAuctionScheduled();
  }

  const nextAuctionScheduled = async function () {
    const exchangeStart = (await dx.auctionStart()).toNumber();
    const now = (await dx.now()).toNumber();
    assert(now < exchangeStart, 'auction starts in future');
    assert(now + 21600 >= exchangeStart, 'auction starts within 6 hrs');
  }

  it('runs correctly through auction until clearing', runThroughAuctionBeforeClear)

  it('clears auction with time', async function () {
    await runThroughAuctionBeforeClear();
    await clearAuctionWithTime();
  })

  it('claims funds correctly after clearing', async function () {
    await runThroughAuctionBeforeClear();
    await clearAuctionWithBuyOrder();

    await claimBuyerFunds();
    await claimSellerFunds();
  })

  it('claims funds correctly after new auction began', async function () {
    await runThroughAuctionBeforeClear();
    await clearAuctionWithBuyOrder();

    await startAuction();

    await claimBuyerFunds();
    await claimSellerFunds();
  }) */
