// const utils = require('./utils');
// // const { wait, waitUntilBlock } = require('tempo')(web3);

// // Since it is a pain to get the tempo package to work,
// // I have done a workaround. If you wish to run tests,
// // please go to DutchExchange.sol and uncomment everything
// // below "For Testing only!"

// const Token = artifacts.require('./Token.sol');
// const DutchExchange = artifacts.require('./DutchExchange.sol');

// contract('DutchExchange', function(accounts) {

// 	let initialiser;
// 	let seller;
// 	let buyer;

// 	let sellToken;
// 	let buyToken;
// 	let TUL;
// 	let dx;

// 	let dxa; 

// 	beforeEach(async function() {
// 		initialiser = accounts[0];

// 		// get seller set up  
// 		seller = accounts[1];
// 		sellToken = await Token.new();
// 		await sellToken.approve(seller, 100)
// 			.then(res => console.log('approve', res.receipt.gasUsed));
//  		await sellToken.transferFrom(initialiser, seller, 100, {from: seller})
//  			.then(res => console.log('transferFrom', res.receipt.gasUsed));

// 		// get buyer set up
// 		buyer = accounts[2];
// 		buyToken = await Token.new();
// 		await buyToken.approve(buyer, 1000);
// 		await buyToken.transferFrom(initialiser, buyer, 1000, {from: buyer});

// 		TUL = await Token.new();

// 		// create dx
// 		dx = await DutchExchange.new(2, 1, sellToken.address, buyToken.address, TUL.address);
// 		dxa = dx.address;
// 	})

// 	const checkConstruction = async function() {
// 		// initial price is set
// 		let initialClosingPrice = await dx.closingPrices(0);
// 		initialClosingPrice = initialClosingPrice.map(x => x.toNumber());
// 		assert.deepEqual(initialClosingPrice, [2, 1], 'initialClosingPrice set correctly');

// 		// sell token is set
// 		const exchangeSellToken = await dx.sellToken();
// 		assert.equal(exchangeSellToken, sellToken.address, 'sellToken set correctly');

// 		// buy token is set
// 		const exchangeBuyToken = await dx.buyToken();
// 		assert.equal(exchangeBuyToken, buyToken.address, 'buyToken set correctly');

// 		// TUL token is set
// 		const exchangeTUL = await dx.TUL();
// 		assert.equal(exchangeTUL, TUL.address, 'TUL set correctly');

// 		// next auction is scheduled correctly
// 		await nextAuctionScheduled();
// 	}

// 	const approveAndSell = async function(amount) {
// 		const sellerBalancesBefore = (await dx.sellerBalances(1, seller)).toNumber();
// 		const sellVolumeBefore = (await dx.sellVolumeCurrent()).toNumber();

// 		await sellToken.approve(dxa, amount, {from: seller})
// 			.then(res => console.log('approve sellOrder', res.receipt.gasUsed));
// 		await dx.postSellOrder(amount, {from: seller})
// 			.then(res => console.log('postSellOrder', res.receipt.gasUsed));

// 		const sellerBalancesAfter = (await dx.sellerBalances(1, seller)).toNumber();
// 		const sellVolumeAfter = (await dx.sellVolumeCurrent()).toNumber();

// 		assert.equal(sellerBalancesBefore + amount, sellerBalancesAfter, 'sellerBalances updated'); 
// 		assert.equal(sellVolumeBefore + amount, sellVolumeAfter, 'sellVolume updated');
// 	}

// 	const postSellOrders = async function() {
// 		await utils.assertRejects(approveAndBuy(50));
// 		await approveAndSell(50);
// 		await approveAndSell(50);
// 	}

// 	const approveAndBuy = async function(amount) {
// 		const buyerBalancesBefore = (await dx.buyerBalances(1, buyer)).toNumber();
// 		const buyVolumeBefore = (await dx.buyVolumes(1)).toNumber();

// 		await buyToken.approve(dxa, amount, {from: buyer})
// 			.then(res => console.log('approve buyOrder', res.receipt.gasUsed));
// 		const price = (await dx.getPrice(1)).map(x => x.toNumber());

// 		await dx.postBuyOrder(amount, 1, {from: buyer})
// 			.then(res => console.log('postBuyOrder', res.receipt.gasUsed));

// 		const buyerBalancesAfter = (await dx.buyerBalances(1, buyer)).toNumber();
// 		const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();

// 		assert.equal(buyerBalancesBefore + amount, buyerBalancesAfter, 'buyerBalances updated');
// 		assert.equal(buyVolumeBefore + amount, buyVolumeAfter, 'buyVolumes updated');
// 	}

// 	const approveBuyAndClaim = async function(amount) {
// 		const claimedAmountBefore = (await dx.claimedAmounts(1, buyer)).toNumber();
// 		const buyerBalancesBefore = (await dx.buyerBalances(1, buyer)).toNumber();
// 		const buyVolumeBefore = (await dx.buyVolumes(1)).toNumber();

// 		await buyToken.approve(dxa, amount, {from: buyer})
// 			.then(res => console.log('approve buyOrderAndClaim', res.receipt.gasUsed));
// 		const price = (await dx.getPrice(1)).map(x => x.toNumber());
// 		await dx.postBuyOrderAndClaim(amount, 1, {from: buyer})
// 			.then(res => console.log('postBuyOrderAndClaim', res.receipt.gasUsed));

// 		const claimedAmountAfter = (await dx.claimedAmounts(1, buyer)).toNumber();
// 		const buyerBalancesAfter = (await dx.buyerBalances(1, buyer)).toNumber();
// 		const expectedReturn = Math.floor(buyerBalancesAfter * price[1] / price[0]) - claimedAmountBefore;
// 		const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();

// 		assert.equal(expectedReturn + claimedAmountBefore, claimedAmountAfter, 'claimedAmounts updated');
// 		assert.equal(buyerBalancesBefore + amount, buyerBalancesAfter, 'buyerBalances updated');
// 		assert.equal(buyVolumeAfter, buyVolumeBefore + amount, 'buyVolumes updated');
// 	}

// 	const postBuyOrdersAndClaim = async function() {
// 		await approveAndBuy(50);
// 		await approveAndBuy(25);
// 		await approveBuyAndClaim(25);
// 		await utils.assertRejects(approveAndSell(50));
// 		await auctionStillRunning();
// 	}

// 	const auctionStillRunning = async function() {
// 		const auctionIndex = (await dx.auctionIndex()).toNumber();
// 		assert.equal(auctionIndex, 1, 'auction index same');
// 	}

// 	const startAuction = async function() {
// 		const exchangeStart = (await dx.auctionStart()).toNumber();
// 			// .then(res => console.log('get exchangeStart', res.receipt.gasUsed)).toNumber();
// 		const now = (await dx.now()).toNumber();
// 		const timeUntilStart = exchangeStart - now;
// 		await dx.increaseTimeBy(1, timeUntilStart);
// 	}

// 	const runThroughAuctionBeforeClear = async function() {
// 		await checkConstruction();
// 		await postSellOrders();

// 		await startAuction();
// 		await postBuyOrdersAndClaim();
// 	}

// 	const clearAuctionWithTime = async function() {
// 		const buyVolume = (await dx.buyVolumes(1)).toNumber();
// 		const sellVolume = (await dx.sellVolumeCurrent()).toNumber();
// 		const auctionStart = (await dx.auctionStart()).toNumber();

// 		// Auction clears when sellVolume * price = buyVolume
// 		// Since price is a function of time, so we have to rearrange the equation for time, which gives
// 		timeWhenAuctionClears = Math.ceil(72000 * sellVolume / buyVolume - 18000 + auctionStart);
// 		await dx.setTime(timeWhenAuctionClears);
// 		const buyerBalance = (await dx.buyerBalances(1, buyer)).toNumber();

// 		await buyToken.approve(dxa, 1, {from: buyer});
// 		await dx.postBuyOrder(1, 1, {from: buyer});

// 		const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();
// 		const buyerBalanceAfter = (await dx.buyerBalances(1, buyer)).toNumber();

// 		// Nothing has been updated
// 		assert.equal(buyVolume, buyVolumeAfter, 'buyVolume constant');
// 		assert.equal(buyerBalance, buyerBalanceAfter, 'buyerBalance constant');

// 		// New auction has been scheduled
// 		await auctionCleared();
// 	}

// 	const clearAuctionWithBuyOrder = async function() {
// 		const buyerBalanceBefore = (await dx.buyerBalances(1, buyer)).toNumber();
// 		const buyVolumeBefore = (await dx.buyVolumes(1)).toNumber();
// 		const sellVolume = (await dx.sellVolumeCurrent()).toNumber();
// 		const auctionStart = (await dx.auctionStart()).toNumber();
// 		const price = (await dx.getPrice(1)).map(x => x.toNumber());

// 		// Auction clears when sellVolume * price = buyVolume
// 		// Solidity rounds down, so slightly less is required
// 		const amountToClearAuction = Math.floor(sellVolume * price[0] / price[1]) - buyVolumeBefore;
// 		// Let's add a little overflow to see if it handles it
// 		const amount = amountToClearAuction + 10;

// 		// It should subtract it before transferring

// 		await buyToken.approve(dxa, amount, {from: buyer});
// 		await dx.postBuyOrder(amount, 1, {from: buyer})
// 			.then(res => console.log('post Buy order which clears auction', res.receipt.gasUsed));

// 		const buyVolumeAfter = (await dx.buyVolumes(1)).toNumber();
// 		const buyerBalanceAfter = (await dx.buyerBalances(1, buyer)).toNumber();

// 		assert.equal(buyVolumeBefore + amountToClearAuction, buyVolumeAfter, 'buyVolume updated');
// 		assert.equal(buyerBalanceBefore + amountToClearAuction, buyerBalanceAfter, 'buyerBalances updated');

// 		// New auction has been scheduled
// 		await auctionCleared();
// 	}

// 	const claimBuyerFunds = async function() {
// 		const buyerBalance = (await dx.buyerBalances(1, buyer)).toNumber();
// 		const claimedAmountBefore = (await dx.claimedAmounts(1, buyer)).toNumber();

// 		await dx.claimBuyerFunds(1, {from: buyer})
// 			.then(res => console.log('claimBuyerFunds', res.receipt.gasUsed));

// 		// Calculate returned value
// 		const price = (await dx.getPrice(1)).map(x => x.toNumber());
// 		const returned = Math.floor(buyerBalance * price[1] / price[0]) - claimedAmountBefore;
// 		const claimedAmountAfter = (await dx.claimedAmounts(1, buyer)).toNumber();

// 		assert.equal(claimedAmountBefore + returned, claimedAmountAfter, 'claimedAmount updated');

// 		// Follow-up claims should fail
// 		utils.assertRejects(dx.claimBuyerFunds(1, {from: buyer}));
// 	}

// 	const claimSellerFunds = async function() {
// 		const sellerBalance = (await dx.sellerBalances(1, seller)).toNumber();

// 		let claimReceipt;

// 		await dx.claimSellerFunds(1, {from: seller})
// 			.then(res => {
// 				claimReceipt = res;
// 				console.log('claimSellerFunds', res.receipt.gasUsed);
// 			})

// 		const returned = claimReceipt.logs[0].args._returned.toNumber();

// 		const price = (await dx.getPrice(1)).map(x => x.toNumber());
// 		const expectedReturn = Math.floor(sellerBalance * price[0] / price[1]);
// 		assert.equal(expectedReturn, returned, 'returned correct amount');

// 		// Follow-up claims should fail
// 		utils.assertRejects(dx.claimSellerFunds(1, {from: seller}));
// 	}

// 	const auctionCleared = async function() {
// 		// Get exchange variables
// 		const price = (await dx.getPrice(1)).map(x => x.toNumber());
// 		const closingPrice = (await dx.closingPrices(1)).map(x => x.toNumber());
// 		const sellVolumeCurrent = (await dx.sellVolumeCurrent()).toNumber();
// 		const sellVolumeNext = (await dx.sellVolumeNext()).toNumber();
// 		const auctionIndex = (await dx.auctionIndex()).toNumber();

// 		// Variables have been updated
// 		assert.deepEqual(closingPrice, price);
// 		assert.equal(sellVolumeCurrent, 0);
// 		assert.equal(sellVolumeNext, 0);
// 		assert.equal(auctionIndex, 2);

// 		// Next auction scheduled
// 		await nextAuctionScheduled();
// 	}

// 	const nextAuctionScheduled = async function() {
// 		const exchangeStart = (await dx.auctionStart()).toNumber();
// 		const now = (await dx.now()).toNumber();
// 		assert(now < exchangeStart, 'auction starts in future');
// 		assert(now + 21600 >= exchangeStart, 'auction starts within 6 hrs');
// 	}

// 	it('runs correctly through auction until clearing', runThroughAuctionBeforeClear)

// 	it('clears auction with time', async function() {
// 		await runThroughAuctionBeforeClear();
// 		await clearAuctionWithTime();
// 	})

// 	it('claims funds correctly after clearing', async function() {
// 		await runThroughAuctionBeforeClear();
// 		await clearAuctionWithBuyOrder();
		
// 		await claimBuyerFunds();
// 		await claimSellerFunds();
// 	})

// 	it('claims funds correctly after new auction began', async function() {
// 		await runThroughAuctionBeforeClear();
// 		await clearAuctionWithBuyOrder();

// 		await startAuction();

// 		await claimBuyerFunds();
// 		await claimSellerFunds();

// 		console.log('balance', web3.eth.getBalance(seller).toNumber());
// 	})
// })