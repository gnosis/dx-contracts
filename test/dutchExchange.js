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
let sellToken
let buyToken
let dx
let oracle

contract('DutchExchange', (accounts) => {
  const [initialiser, seller1, , buyer1] = accounts

  beforeEach(async () => {
    // get buyers, sellers set up and running
    buyToken = await TokenGNO.deployed()
    sellToken = await EtherToken.deployed()
    // create dx
    dx = await DutchExchange.deployed()
    // create price Oracle
    oracle = await PriceOracle.deployed()

    for (let acct = 1; acct < accounts.length; acct++) {
      await Promise.all([
        buyToken.transfer(accounts[acct], 10 ** 18, { from: initialiser }),
        // depoit into etherToken contract
        sellToken.deposit({ from: accounts[acct], value: 10 ** 9 }),
        // depositing into the exchange
        sellToken.approve(dx.address, 10 ** 9, { from: accounts[acct] }),
        dx.deposit(sellToken.address, 10 ** 9, { from: accounts[acct] }),
        buyToken.approve(dx.address, 10 ** 18, { from: accounts[acct] }),
        dx.deposit(buyToken.address, 10 ** 18, { from: accounts[acct] }),
      ])
    }

    // add token Pair
    // updating the oracle Price. Needs to be changed later to another mechanism
    await oracle.updateETHUSDPrice(60000)
    // add tokenPair ETH GNO
    await dx.addTokenPair(
      sellToken.address,
      buyToken.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  it('Buys tokens at the 2:1 price', async () => {
    const startingTimeOfAuction = (await dx.auctionStarts.call(sellToken.address, buyToken.address)).toNumber()
    // const currBlockNum = () => utils.blockNumber()
    const auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()
    let balanceBeforeClaim

    // wait for the right time to send buyOrder
    await wait(startingTimeOfAuction - timestamp() + 6 * 3600)
    assert.equal(timestamp() > startingTimeOfAuction, true)

    // buy
    await dx.postBuyOrder(sellToken.address, buyToken.address, auctionIndex, 10 ** 9 * 2, { from: buyer1 })

    // claim Buyerfunds
    balanceBeforeClaim = (await dx.balances.call(sellToken.address, buyer1)).toNumber()
    await dx.claimBuyerFunds(sellToken.address, buyToken.address, buyer1, auctionIndex)
    assert.equal(balanceBeforeClaim + 10 ** 9 - (await dx.balances.call(sellToken.address, buyer1)).toNumber() < MaxRoundingError, true)

    // claim Sellerfunds
    balanceBeforeClaim = (await dx.balances.call(buyToken.address, seller1)).toNumber()
    await dx.claimSellerFunds(sellToken.address, buyToken.address, seller1, auctionIndex)
    assert.equal(balanceBeforeClaim + 10 ** 9 / 2 - (await dx.balances.call(buyToken.address, seller1)).toNumber() < MaxRoundingError, true)
  })
})

contract('DutchExchange', (accounts) => {
  const [initialiser, seller1, seller2, buyer1, buyer2] = accounts

  beforeEach(async () => {
    // get sellers set up and running
    buyToken = await TokenGNO.deployed()
    sellToken = await EtherToken.deployed()
    // create dx
    dx = await DutchExchange.deployed()
    oracle = await PriceOracle.deployed()

    for (let acct = 1; acct < accounts.length; acct++) {
      await Promise.all([
        buyToken.transfer(accounts[acct], 10 ** 18, { from: initialiser }),
        // depoit into etherToken contract
        sellToken.deposit({ from: accounts[acct], value: 10 ** 9 }),
        // depositing into the exchange
        sellToken.approve(dx.address, 10 ** 9, { from: accounts[acct] }),
        dx.deposit(sellToken.address, 10 ** 9, { from: accounts[acct] }),
        buyToken.approve(dx.address, 10 ** 18, { from: accounts[acct] }),
        dx.deposit(buyToken.address, 10 ** 18, { from: accounts[acct] }),
      ])
    }

    // add token Pair
    // updating the oracle Price. Needs to be changed later to another mechanism
    await oracle.updateETHUSDPrice(60000)
    // add tokenPair ETH GNO
    await dx.addTokenPair(
      sellToken.address,
      buyToken.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  it('process two auctions one after the other in one pair only', async () => {
    let startingTimeOfAuction = (await dx.auctionStarts.call(sellToken.address, buyToken.address)).toNumber()
    let balanceBeforeClaim, auctionIndex

    await wait(startingTimeOfAuction - timestamp() + 6 * 3600)

    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()
    assert.equal(timestamp() > startingTimeOfAuction, true)

    await dx.postBuyOrder(sellToken.address, buyToken.address, auctionIndex, 10 ** 9 * 2, { from: buyer1 })

    balanceBeforeClaim = (await dx.balances.call(sellToken.address, buyer1)).toNumber()
    await dx.claimBuyerFunds(sellToken.address, buyToken.address, buyer1, auctionIndex)
    assert.equal(balanceBeforeClaim + 10 ** 9 - (await dx.balances.call(sellToken.address, buyer1)).toNumber() < MaxRoundingError, true)

    balanceBeforeClaim = (await dx.balances.call(buyToken.address, seller1)).toNumber()
    await dx.claimSellerFunds(sellToken.address, buyToken.address, seller1, auctionIndex)
    assert.equal(balanceBeforeClaim + 10 ** 9 / 2 - (await dx.balances.call(buyToken.address, seller1)).toNumber() < MaxRoundingError, true)

    // post new sell order to start next auction
    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()
    startingTimeOfAuction = (await dx.auctionStarts.call(sellToken.address, buyToken.address)).toNumber()
    await dx.postSellOrder(sellToken.address, buyToken.address, auctionIndex, 10 ** 9, { from: seller2 })
    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()

    startingTimeOfAuction = await dx.auctionStarts.call(sellToken.address, buyToken.address)

    // buy it up again
    await wait((startingTimeOfAuction - timestamp()) + (6 * 3600))
    assert.equal(timestamp() > startingTimeOfAuction, true)
    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()
    await dx.postBuyOrder(sellToken.address, buyToken.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })
  })
})

contract('DutchExchange', (accounts) => {
  const [initialiser, seller1, seller2, buyer1, buyer2] = accounts

  beforeEach(async () => {
    // get sellers set up and running
    sellToken = await EtherToken.deployed()
    // get buyer set up
    buyToken = await TokenGNO.deployed()
    // create dx
    dx = await DutchExchange.deployed()
    oracle = await PriceOracle.deployed()

    for (let acct = 1; acct < 9; acct++) {
      await Promise.all([
        buyToken.transfer(accounts[acct], 10 ** 18, { from: initialiser }),
        // depoit into etherToken contract
        sellToken.deposit({ from: accounts[acct], value: 10 ** 9 }),
        // depositing into the exchange
        sellToken.approve(dx.address, 10 ** 9, { from: accounts[acct] }),
        dx.deposit(sellToken.address, 10 ** 9, { from: accounts[acct] }),
        buyToken.approve(dx.address, 10 ** 18, { from: accounts[acct] }),
        dx.deposit(buyToken.address, 10 ** 18, { from: accounts[acct] }),
      ])
    }

    // add token Pair
    // updating the oracle Price. Needs to be changed later to another mechanism
    await oracle.updateETHUSDPrice(60000)

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      sellToken.address,
      buyToken.address,
      10 ** 9,
      10 ** 8 * 5,
      2,
      1,
      { from: seller1 },
    )
  })

  it('test a trade on the opposite pair', async () => {
    let startingTimeOfAuction = (await dx.auctionStarts.call(sellToken.address, buyToken.address)).toNumber()
    let balanceBeforeClaim, auctionIndex

    await wait(startingTimeOfAuction - timestamp() + 6 * 3600)
    assert.equal(timestamp() > startingTimeOfAuction, true)

    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()
    await dx.postBuyOrder(sellToken.address, buyToken.address, auctionIndex, 10 ** 9 * 2, { from: buyer1 })
    await dx.postBuyOrder(buyToken.address, sellToken.address, auctionIndex, 10 ** 7 * 25, { from: seller2 })
    balanceBeforeClaim = (await dx.balances.call(sellToken.address, buyer1)).toNumber()
    await dx.claimBuyerFunds(sellToken.address, buyToken.address, buyer1, auctionIndex)
    assert.equal(Math.abs(balanceBeforeClaim + 10 ** 9 - (await dx.balances.call(sellToken.address, buyer1)).toNumber()) < MaxRoundingError, true)

    balanceBeforeClaim = (await dx.balances.call(buyToken.address, seller2)).toNumber()
    await dx.claimBuyerFunds(buyToken.address, sellToken.address, seller2, auctionIndex)
    assert.equal(Math.abs(balanceBeforeClaim + 10 ** 8 * 5 - (await dx.balances.call(buyToken.address, seller2)).toNumber()) < MaxRoundingError, true)

    balanceBeforeClaim = (await dx.balances.call(buyToken.address, seller1)).toNumber()
    await dx.claimSellerFunds(sellToken.address, buyToken.address, seller1, auctionIndex)
    assert.equal(balanceBeforeClaim + 10 ** 9 / 2 - (await dx.balances.call(buyToken.address, seller1)).toNumber() < MaxRoundingError, true)

    // post new sell order to start next auction
    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()
    startingTimeOfAuction = (await dx.auctionStarts.call(sellToken.address, buyToken.address)).toNumber()
    await dx.postSellOrder(sellToken.address, buyToken.address, auctionIndex, 10 ** 9, { from: seller2 })
    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()

    startingTimeOfAuction = await dx.auctionStarts.call(sellToken.address, buyToken.address)

    // buy it up again
    await wait(startingTimeOfAuction - timestamp() + 6 * 3600)
    assert.equal(timestamp() > startingTimeOfAuction, true)
    auctionIndex = (await dx.latestAuctionIndices.call(sellToken.address, buyToken.address)).toNumber()
    await dx.postBuyOrder(sellToken.address, buyToken.address, auctionIndex, 10 ** 9 * 2, { from: buyer2 })
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
