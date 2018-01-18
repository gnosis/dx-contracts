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

// const PriceOracleInterface = artifacts.require('PriceOracleInterface')
const argv = require('minimist')(process.argv.slice(2), { alias: { selector: 'sel' } })
const { 
  eventWatcher,
  log,
} = require('./utils')

const {
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
  waitUntilPriceIsXPercentOfPreviousPrice,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
// let oracle
// let tokenTUL

let contracts

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    // TokenTUL: tokenTUL,
    // PriceOracle: oracle,
  } = contracts)
}

const c1 = () => contract('DutchExchange --> Tulip Flow --> Check new claimBuyerFunds fn ||', (accounts) => {
  const [master, seller1, , buyer1] = accounts
  // const user = seller1
  // let userTulips
  let seller1Balance 
  
  const startBal = {
    startingETH: 1000..toWei(),
    startingGNO: 1000..toWei(),
    ethUSDPrice: 6000..toWei(),   // 400 ETH @ $6000/ETH = $2,400,000 USD
    sellingAmount: 400..toWei(), // Same as web3.toWei(50, 'ether')
  }
  const { 
    startingETH,
    sellingAmount,
    // startingGNO,
    // ethUSDPrice,
  } = startBal

  before(async () => {
    // get contracts
    await setupContracts()
    eventWatcher(dx, 'LogNumber', {})
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
    assert.equal(seller1Balance, startingETH, `Seller1 should have balance of ${startingETH.toEth()}`)

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
    log('Selling amt ', sellingAmount.toEth())
    await dx.addTokenPair(
      eth.address,
      gno.address,
      sellingAmount,  // 500 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
      0,              // buyVolume for GNO
      2,              // lastClosingPrice NUM
      1,              // lastClosingPrice DEN
      { from: seller1 },
    )
    seller1Balance = await getBalance(seller1, eth) // dx.balances(token) - sellingAmt
    log(`\nSeller Balance ====> ${seller1Balance.toEth()}\n`)
    assert.equal(seller1Balance, startingETH - sellingAmount, `Seller1 should have ${startingETH.toEth()} balance after new Token Pair add`)
  })
  
  it('Check sellVolume', async () => {
    log(`
    =====================================
    T1: Check sellVolume
    =====================================
    `)

    const sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    const svFee = f => sellingAmount * (f / 100)
    log(`
    SELLVOLUMES === ${sellVolumes.toEth()}
    FEE         === ${svFee(0.5).toEth()}
    `)
    assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
  })
  
  it('BUYER1: Non Auction clearing PostBuyOrder + Claim => Tulips = 0', async () => {
    eventWatcher(dx, 'ClaimBuyerFunds', {})
    eventWatcher(dx, 'LogNumber', {})
    log(`
    ============================================================================================
    T2.5: Buyer1 PostBuyOrder => [[Non Auction clearing PostBuyOrder + Claim]] => [[Tulips = 0]]
    ============================================================================================
    `)
    log(`
    BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
    `)
    /*
     * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
     */
    await setAndCheckAuctionStarted(eth, gno)    
    /*
     * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
     * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
     * @{return} ... 20GNO * 1/4 => 5 ETHER
     */
    // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
    const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
    // Should be 4 here as closing price starts @ 2 and we times by 2
    const [num, den] = (await dx.getPriceForJS(eth.address, gno.address, 1)).map(i => i.toNumber())
    log(`
    Last Closing Prices:
    closeN        = ${closingNum}
    closeD        = ${closingDen}
    closingPrice  = ${closingNum / closingDen}
    ===========================================
    Current Prices:
    n             = ${num}
    d             = ${den}
    price         = ${num / den}
    `)
    await postBuyOrder(eth, gno, false, (20).toWei(), buyer1)
    log(`\nBuy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}`)
    let idx = await getAuctionIndex()
    const [claimedFunds, tulipsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx)).map(i => i.toNumber())
    await dx.claimBuyerFunds(eth.address, gno.address, buyer1, idx)
    // const { args, args: { returned: claimedFunds, tulipsIssued } } = dx.ClaimBuyerFunds((err, resp) => resp)
    log(`
    CLAIMED FUNDS => ${claimedFunds.toEth()}
    TULIPS ISSUED => ${tulipsIssued.toEth()}
    `)

    assert.equal(tulipsIssued, 0, 'Tulips only issued / minted after auction Close so here = 0')
    // check tulip
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
  })

  xit('BUYER1: Auction clearing PostBuyOrder + Claim => Tulips = sellVolume', async () => {
    eventWatcher(dx, 'AuctionCleared', {})
    log(`
    ================================================================================================
    T3: Buyer1 PostBuyOrder => Auction clearing PostBuyOrder + Claim => Tulips = 49.75 || sellVolume
    ================================================================================================
    `)
    log(`
    BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
    `) 
    /*
     * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
     * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
     * @{return} ... 20GNO * 1/4 => 5 ETHER
     */
    await postBuyOrder(eth, gno, false, 400..toWei(), buyer1)
    log(`\nBuy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}`)
    let idx = await getAuctionIndex()
    const [claimedFunds, tulipsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx - 1)).map(i => i.toNumber())
    await dx.claimBuyerFunds(eth.address, gno.address, buyer1, idx - 1)
    // const { args, args: { returned: claimedFunds, tulipsIssued } } = dx.ClaimBuyerFunds((err, resp) => resp)
    log(`
    CLAIMED FUNDS => ${claimedFunds.toEth()}
    TULIPS ISSUED => ${tulipsIssued.toEth()}
    `)

    assert.equal(tulipsIssued.toEth(), 49.75, 'Tulips only issued / minted after auction Close so here = 0')
    // check tulip
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
  })

  xit('Clear Auction, assert auctionIndex increase', async () => {
    /*
     * SUB TEST 1: clearAuction
     */ 
    log('buyer1 BALANCE = ', (await getBalance(buyer1, gno)).toEth())
    // just to close auction
    await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    log(`
    New Auction Index -> ${await getAuctionIndex()}
    `)
    assert.isAtLeast(await getAuctionIndex(), 2)
  })

  xit('BUYER1: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
    // event listeners
    // eventWatcher(tokenTUL, 'NewTokensMinted')
    // eventWatcher(dx, 'AuctionCleared')
    log(`
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

  xit('SELLER: ETH --> GNO: seller can lock tokens and only unlock them 24 hours later', async () => {
    log(`
    ============================================
    T5: Seller - Locking and Unlocking of Tokens
    ============================================
    `)
    log('seller BALANCE = ', (await getBalance(seller1, eth)).toEth())
    // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    // just to close auction
    await claimSellerFunds(eth, gno, seller1, 1)
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
    await unlockTulipTokens(seller1)
  })

  after(eventWatcher.stopWatching())
})

const c2 = () => contract('DutchExchange --> Tulip Flow --> 1 Seller sells 50 ETHER @ 2:1 price --> only 1 BUYER', (accounts) => {
  const [master, seller1, , buyer1] = accounts
  // const user = seller1
  // let userTulips
  let seller1Balance 
  
  const startBal = {
    startingETH: 90..toWei(),
    startingGNO: 1000..toWei(),
    ethUSDPrice: 60000,
    sellingAmount: 50..toWei(), // Same as web3.toWei(50, 'ether')
  }
  const { 
    startingETH,
    sellingAmount,
    // startingGNO,
    // ethUSDPrice,
  } = startBal

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
    log(`
    =====================================
    T1: Check sellVolume
    =====================================
    `)

    const sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    const svFee = f => sellingAmount * (f / 100)
    log(`
    SELLVOLUMES === ${sellVolumes.toEth()}
    FEE         === ${svFee(0.5).toEth()}
    `)
    assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
  })
  
  it('BUYER1: postBuyOrder + claim', async () => {
    log(`
    =====================================
    T3: Buyer1 PostBuyOrder
    =====================================
    `)
    log(`
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
    log(`
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
    log(`
      CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
    `)
    await checkUserReceivesTulipTokens(eth, gno, buyer1)
  })

  it('Clear Auction, assert auctionIndex increase', async () => {
    /*
     * SUB TEST 1: clearAuction
     */ 
    log('buyer1 BALANCE = ', (await getBalance(buyer1, gno)).toEth())
    // just to close auction
    await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    log(`
    New Auction Index -> ${await getAuctionIndex()}
    `)
    assert.isAtLeast(await getAuctionIndex(), 2)
  })

  it('BUYER1: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
    // event listeners
    // eventWatcher(tokenTUL, 'NewTokensMinted', {})
    // eventWatcher(dx, 'AuctionCleared', {})
    log(`
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
    log(`
    ============================================
    T5: Seller - Locking and Unlocking of Tokens
    ============================================
    `)
    log('seller BALANCE = ', (await getBalance(seller1, eth)).toEth())
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

const c3 = () => contract('DutchExchange --> Tulip Flow --> Seller sells 50 ETHER @ 2:1 price', (accounts) => {
  const [master, seller1, , buyer1, buyer2] = accounts
  // const user = seller1
  // let userTulips
  let seller1Balance
  
  const startBal = {
    startingETH: 90..toWei(),
    startingGNO: 1000..toWei(),
    ethUSDPrice: 60000,
    sellingAmount: 50..toWei(), // Same as web3.toWei(50, 'ether')
  }
  const {
    startingETH,
    sellingAmount,
    // startingGNO,
    // ethUSDPrice,
  } = startBal

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
    log(`
    =====================================
    T1: Check sellVolume
    =====================================
    `)

    const sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    const svFee = f => sellingAmount * (f / 100)
    log(`
    SELLVOLUMES === ${sellVolumes.toEth()}
    FEE         === ${svFee(0.5).toEth()}
    `)
    assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
  })

  it('Buyer2 postBuyOrder + claim', async () => {
    log(`
    =====================================
    T2: Buyer2 PostBuyOrder
    =====================================
    `)
    log(`
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
    log(`
    =====================================
    T3: Buyer1 PostBuyOrder
    =====================================
    `)
    log(`
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
    log(`
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
    log(`
      CURRENT ETH//GNO bVolume = ${buyVolumes.toEth()}
    `)
    await checkUserReceivesTulipTokens(eth, gno, buyer1)
  })

  it('Clear Auction, assert auctionIndex increase', async () => {
    log(`
    ================================================
    T4: Buyer1 - Clears Auction and Auction Idx >= 2
    ================================================
    `)
    /*
     * SUB TEST 1: clearAuction
     */ 
    log('buyer1 BALANCE = ', (await getBalance(buyer1, gno)).toEth())
    // just to close auction
    await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    log(`
    New Auction Index -> ${await getAuctionIndex()}
    `)
    assert.isAtLeast(await getAuctionIndex(), 2)
  })

  it('BUYER1: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
    // event listeners
    // eventWatcher(tokenTUL, 'NewTokensMinted', {})
    // eventWatcher(dx, 'AuctionCleared', {})
    log(`
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
    log(`
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
    log(`
    ============================================
    T7: Seller - Locking and Unlocking of Tokens
    ============================================
    `)
    log('seller BALANCE = ', (await getBalance(seller1, eth)).toEth())
    // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
    // just to close auction
    await claimSellerFunds(eth, gno, seller1, 1)
    // await checkUserReceivesTulipTokens(eth, gno, buyer1)
    await unlockTulipTokens(seller1)
  })

  after(eventWatcher.stopWatching)
})

// arg conditionally start contracts
if (argv.c === 1) {
  // fire contract 1
  c1()
} else if (argv.c === 2) {
  // fire contract 2
  c2()
} else if (argv.c === 3) {
  // fire contract 3
  c3()
} else {
  return Promise.all([c1(), c2(), c3()])
}
