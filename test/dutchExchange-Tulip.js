/*
  eslint prefer-const: 0,
  max-len: 0,
  object-curly-newline: 1,
  no-param-reassign: 0,
  no-console: 0,
  no-mixed-operators: 0,
  no-floating-decimal: 0,
  no-trailing-spaces: 0,
  no-multi-spaces: 0,
*/
const PriceOracleInterface = artifacts.require('PriceOracleInterface')

const { 
  eventWatcher,
  logger,
  timestamp,
} = require('./utils')

const {
  checkBalanceBeforeClaim,
  checkUserReceivesTulipTokens,
  claimBuyerFunds,
  claimSellerFunds,
  getAuctionIndex,
  getBalance,
  getContracts,
  postBuyOrder,
  setupTest,
  setAndCheckAuctionStarted,
  unlockTulipTokens,
  wait,
  waitUntilPriceIsXPercentOfPreviousPrice,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
let oracle
let tokenTUL

let contracts

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    TokenTUL: tokenTUL,
    PriceOracle: oracle,
  } = contracts)
}

contract('DutchExchange --> Tulip Flow --> 1 Seller sells 50 ETHER @ 2:1 price --> only 1 BUYER', (accounts) => {
  const [master, seller1, seller2, buyer1, buyer2] = accounts
  // const user = seller1
  // let userTulips
  let seller1Balance, initialSellVolume 
  
  const startBal = {
    startingETH: 90..toWei(),
    startingGNO: 1000..toWei(),
    ethUSDPrice: 60000,
    sellingAmount: 50..toWei(), // Same as web3.toWei(50, 'ether')
  }
  const { startingETH, startingGNO, ethUSDPrice, sellingAmount } = startBal

  before(async () => {
    // get contracts
    await setupContracts()

    /*
     * SUB TEST 1: Check passed in ACCT has NO balances in DX for token passed in
     */
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, 0, 'Seller1 should have 0 balance')

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    /*
     * SUB TEST 2: Check passed in ACCT has NO balances in DX for token passed in
     */
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, startingETH, 'Seller1 should have 90 * 10 ** 18')

    /*
     * SUB TEST 3: assert both eth and gno get approved by DX
     */
    // approve ETH
    await dx.updateApprovalOfToken(eth.address, true, { from: master })
    // approve GNO
    await dx.updateApprovalOfToken(gno.address, true, { from: master })

    assert.equal(await dx.approvedTokens.call(eth.address), true, 'ETH is approved by DX')
    assert.equal(await dx.approvedTokens.call(gno.address), true, 'GNO is approved by DX')

    /*
     * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
     */
    // add tokenPair ETH GNO

    await dx.addTokenPair(
      eth.address,
      gno.address,
      sellingAmount,  // 50 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
      0,              // buyVolume for GNO
      2,              // lastClosingPrice NUM
      1,              // lastClosingPrice DEN
      { from: seller1 },
    )
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, (40).toWei(), 'Seller1 should have 40 balance after new Token Pair add')
  })
  it('Check sellVolume', async () => {
    console.log(`
    =====================================
    T1: Check sellVolume
    =====================================
    `)

    const sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    const svFee = f => sellingAmount * (f / 100)
    console.log(`
    SELLVOLUMES === ${sellVolumes.toEth()}
    FEE         === ${svFee(0.5).toEth()}
    `)
    assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
  })
  
  it('BUYER1: postBuyOrder + claim', async () => {
    console.log(`
    =====================================
    T3: Buyer1 PostBuyOrder
    =====================================
    `)
    console.log(`
    BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
    `)
    /*
     * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
     */
    await setAndCheckAuctionStarted(eth, gno)
    // eventWatcher(dx, 'NewBuyOrder', {})
    
    /*
     * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
     * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
     * @{return} ... 20GNO * 1/4 => 5 ETHER
     */
    await postBuyOrder(eth, gno, false, (20).toWei(), buyer1)
    let buyVolumes = (await dx.buyVolumes.call(eth.address, gno.address)).toNumber()
    console.log(`
      CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
    `)
    // check tulip
    await checkUserReceivesTulipTokens(eth, gno, buyer1)

    /*
     * SUB TEST 3: postBuyOrder => 20 GNO @ 2:1 price
     * post buy order @ price 2:1 aka 1 GNO => 1/2 ETH && 1 ETH => 2 GNO
     * @{return} ... 20GNO * 1/2 => 10 ETHER
     */
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // post buy order
    await postBuyOrder(eth, gno, false, (20).toWei(), buyer1)
    buyVolumes = (await dx.buyVolumes.call(eth.address, gno.address)).toNumber()
    console.log(`
      CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
    `)
    await checkUserReceivesTulipTokens(eth, gno, buyer1)
  })

  it('Clear Auction, assert auctionIndex increase', async () => {
    /*
     * SUB TEST 1: clearAuction
     */ 
    console.log('buyer1 BALANCE = ', (await getBalance(buyer1, gno)).toEth())
    // just to close auction
    await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    console.log(`
    New Auction Index -> ${await getAuctionIndex()}
    `)
    assert.isAtLeast(await getAuctionIndex(), 2)
  })

  it('BUYER1: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
    // event listeners
    // eventWatcher(tokenTUL, 'NewTokensMinted', {})
    // eventWatcher(dx, 'AuctionCleared', {})
    console.log(`
    ============================================
    T4: Buyer1 - Locking and Unlocking of Tokens
    ============================================
    `)
    /*
     * SUB TEST 1: Try getting Tulips
     */ 
    await claimBuyerFunds(eth, gno, buyer1, 1)
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
    await unlockTulipTokens(buyer1)
  })

  it('SELLER: ETH --> GNO: seller can lock tokens and only unlock them 24 hours later', async () => {
    console.log(`
    ============================================
    T5: Seller - Locking and Unlocking of Tokens
    ============================================
    `)
    console.log('seller BALANCE = ', (await getBalance(seller1, eth)).toEth())
    // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    // just to close auction
    await claimSellerFunds(eth, gno, seller1, 1)
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
    await unlockTulipTokens(seller1)
  })

  after(() => {
    eventWatcher.stopWatching()
  })
})

contract('DutchExchange --> Tulip Flow --> Seller sells 50 ETHER @ 2:1 price', (accounts) => {
  const [master, seller1, seller2, buyer1, buyer2] = accounts
  // const user = seller1
  // let userTulips
  let seller1Balance, initialSellVolume 
  
  const startBal = {
    startingETH: 90..toWei(),
    startingGNO: 1000..toWei(),
    ethUSDPrice: 60000,
    sellingAmount: 50..toWei(), // Same as web3.toWei(50, 'ether')
  }
  const { startingETH, startingGNO, ethUSDPrice, sellingAmount } = startBal

  before(async () => {
    // get contracts
    await setupContracts()

    /*
     * SUB TEST 1: Check passed in ACCT has NO balances in DX for token passed in
     */
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, 0, 'Seller1 should have 0 balance')

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    /*
     * SUB TEST 2: Check passed in ACCT has NO balances in DX for token passed in
     */
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, startingETH, 'Seller1 should have 90 * 10 ** 18')

    /*
     * SUB TEST 3: assert both eth and gno get approved by DX
     */
    // approve ETH
    await dx.updateApprovalOfToken(eth.address, true, { from: master })
    // approve GNO
    await dx.updateApprovalOfToken(gno.address, true, { from: master })

    assert.equal(await dx.approvedTokens.call(eth.address), true, 'ETH is approved by DX')
    assert.equal(await dx.approvedTokens.call(gno.address), true, 'GNO is approved by DX')

    /*
     * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
     */
    // add tokenPair ETH GNO

    await dx.addTokenPair(
      eth.address,
      gno.address,
      sellingAmount,  // 50 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
      0,              // buyVolume for GNO
      2,              // lastClosingPrice NUM
      1,              // lastClosingPrice DEN
      { from: seller1 },
    )
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, (40).toWei(), 'Seller1 should have 40 balance after new Token Pair add')
  })
  it('Check sellVolume', async () => {
    console.log(`
    =====================================
    T1: Check sellVolume
    =====================================
    `)

    const sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    const svFee = f => sellingAmount * (f / 100)
    console.log(`
    SELLVOLUMES === ${sellVolumes.toEth()}
    FEE         === ${svFee(0.5).toEth()}
    `)
    assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
  })

  it('Buyer2 postBuyOrder + claim', async () => {
    console.log(`
    =====================================
    T2: Buyer2 PostBuyOrder
    =====================================
    `)
    console.log(`
    BUYER2 GNO BALANCE = ${(await getBalance(buyer2, gno)).toEth()}
    `)
    /*
     * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
     */
    await setAndCheckAuctionStarted(eth, gno)

    /*
     * SUB TEST 2: POSTBUYORDER - CHECK RETURNED = TULIPS VIA CLAIMBUYERFUNDS.CALL()
     */
    // post buy order
    await postBuyOrder(eth, gno, false, (20).toWei(), buyer2)
    // wait for price to drop to half starting price in this auction: 2:1 in this case
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // claimFunds and generate Tulips
    await checkUserReceivesTulipTokens(eth, gno, buyer2)
  })

  it('BUYER1: postBuyOrder + claim', async () => {
    console.log(`
    =====================================
    T3: Buyer1 PostBuyOrder
    =====================================
    `)
    console.log(`
    BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
    `)
    /*
     * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
     */

    /*
     * SUB TEST 2: postBuyOrder => 20 GNO @ 2:1 price
     * post buy order @ price 4:1 aka 1 GNO => 1/2 ETH && 1 ETH => 2 GNO
     * @{return} ... 20GNO * 1/2 => 10 ETHER
     */
    await postBuyOrder(eth, gno, false, (20).toWei(), buyer1)
    let buyVolumes = (await dx.buyVolumes.call(eth.address, gno.address)).toNumber()
    console.log(`
      CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
    `)
    // check tulip
    await checkUserReceivesTulipTokens(eth, gno, buyer1)

    /*
     * SUB TEST 3: postBuyOrder => 20 GNO @ 2:1 price
     * post buy order @ price 2:1 aka 1 GNO => 1 ETH && 1 ETH => 1 GNO
     * @{return} ... 20GNO * 1 => 20 ETHER
     */
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // post buy order
    await postBuyOrder(eth, gno, false, (20).toWei(), buyer1)
    buyVolumes = (await dx.buyVolumes.call(eth.address, gno.address)).toNumber()
    console.log(`
      CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
    `)
    await checkUserReceivesTulipTokens(eth, gno, buyer1)
  })

  it('Clear Auction, assert auctionIndex increase', async () => {
    console.log(`
    ================================================
    T4: Buyer1 - Clears Auction and Auction Idx >= 2
    ================================================
    `)
    /*
     * SUB TEST 1: clearAuction
     */ 
    console.log('buyer1 BALANCE = ', (await getBalance(buyer1, gno)).toEth())
    // just to close auction
    await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    console.log(`
    New Auction Index -> ${await getAuctionIndex()}
    `)
    assert.isAtLeast(await getAuctionIndex(), 2)
  })

  it('BUYER1: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
    // event listeners
    // eventWatcher(tokenTUL, 'NewTokensMinted', {})
    // eventWatcher(dx, 'AuctionCleared', {})
    console.log(`
    ============================================
    T5: Buyer1 - Locking and Unlocking of Tokens
    ============================================
    `)
    /*
     * SUB TEST 1: Try getting Tulips
     */ 
    await claimBuyerFunds(eth, gno, buyer1, 1)
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
    await unlockTulipTokens(buyer1)
  })

  it('BUYER2: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
    // event listeners
    // eventWatcher(tokenTUL, 'NewTokensMinted', {})
    // eventWatcher(dx, 'AuctionCleared', {})
    console.log(`
    ============================================
    T6: Buyer2 - Locking and Unlocking of Tokens
    ============================================
    `)
    /*
     * SUB TEST 1: Try getting Tulips
     */ 
    await claimBuyerFunds(eth, gno, buyer2, 1)
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
    await unlockTulipTokens(buyer2)
  })

  it('SELLER: ETH --> GNO: seller can lock tokens and only unlock them 24 hours later', async () => {
    console.log(`
    ============================================
    T7: Seller - Locking and Unlocking of Tokens
    ============================================
    `)
    console.log('seller BALANCE = ', (await getBalance(seller1, eth)).toEth())
    // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    // just to close auction
    await claimSellerFunds(eth, gno, seller1, 1)
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
    await unlockTulipTokens(seller1)
  })

  after(eventWatcher.stopWatching)
})
