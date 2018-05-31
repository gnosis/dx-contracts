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

const TokenGNO2 = artifacts.require('TokenGNO')
const {
  eventWatcher,
  log,
  gasLogger,
  timestamp,
  enableContractFlag,
  makeSnapshot,
  revertSnapshot
} = require('./utils')

const {
  assertClaimingFundsCreatesMGNs,
  assertReturnedPlusMGNs,
  claimBuyerFunds,
  claimSellerFunds,
  getAuctionIndex,
  getBalance,
  getContracts,
  postBuyOrder,
  postSellOrder,
  setupTest,
  setAndCheckAuctionStarted,
  unlockMGNTokens,
  wait,
  waitUntilPriceIsXPercentOfPreviousPrice,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
let tokenMGN
let contracts
let pp

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    TokenFRT: tokenMGN,
    PriceOracleInterface: pp,
  } = contracts)
}

const c1 = () => contract('DX MGN Flow --> 1 Seller + 1 Buyer', (accounts) => {
  const [master, seller1, seller2, buyer1, buyer2, seller3] = accounts
  const sellers = [seller1, seller2]

  let seller1Balance, seller2Balance, sellVolumes, buyer1Returns, buyer2Returns
  let seller3SellAmount

  const startBal = {
    startingETH: 1000..toWei(),
    startingGNO: 1000..toWei(),
    ethUSDPrice: 6000..toWei(),   // 400 ETH @ $6000/ETH = $2,400,000 USD
    sellingAmount: 100..toWei(), // Same as web3.toWei(50, 'ether') - $60,000USD
  }
  const {
    startingETH,
    sellingAmount,
    startingGNO,
    // ethUSDPrice,
  } = startBal

  afterEach(() => {
    gasLogger()
    eventWatcher.stopWatching()
  })

  before('Before Hook', async () => {
    // get contracts
    await setupContracts()
    eventWatcher(dx, 'LogNumber', {});
    /*
     * SUB TEST 1: Check passed in ACCT has NO balances in DX for token passed in
     */
     ([seller1Balance, seller2Balance] = await Promise.all(sellers.map(s => getBalance(s, eth))))
     assert.equal(seller1Balance, 0, 'Seller1 should have 0 balance')
     assert.equal(seller2Balance, 0, 'Seller2 should have 0 balance')

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal);
    /*
     * SUB TEST 2: Check passed in ACCT has NO balances in DX for token passed in
     */
     ([seller1Balance, seller2Balance] = await Promise.all(sellers.map(s => getBalance(s, eth))))
     assert.equal(seller1Balance, startingETH, `Seller1 should have balance of ${startingETH.toEth()}`)
     assert.equal(seller2Balance, startingETH, `Seller2 should have balance of ${startingETH.toEth()}`)

    /*
     * SUB TEST 3: assert both eth and gno get approved by DX
     */
    // approve ETH
    await dx.updateApprovalOfToken([eth.address], true, { from: master })

    // approve GNO
    await dx.updateApprovalOfToken([gno.address], true, { from: master })

    assert.equal(await dx.approvedTokens.call(eth.address), true, 'ETH is approved by DX')
    assert.equal(await dx.approvedTokens.call(gno.address), true, 'GNO is approved by DX')
  })

  let currentSnapshotId

  describe('DX MGN Flow --> 1 Seller + 1 Buyer', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      /*
       * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
       */
      // add tokenPair ETH GNO
      log('Selling amt ', sellingAmount.toEth())
      await dx.addTokenPair(
        eth.address,
        gno.address,
        sellingAmount,  // 100 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
        0,              // buyVolume for GNO
        2,              // lastClosingPrice NUM
        1,              // lastClosingPrice DEN
        { from: seller1 },
      )
      seller1Balance = await getBalance(seller1, eth) // dx.balances(token) - sellingAmt
      log(`\nSeller Balance ====> ${seller1Balance.toEth()}\n`)
      assert.equal(seller1Balance, startingETH - sellingAmount, `Seller1 should have ${startingETH.toEth()} balance after new Token Pair add`)

    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('Check sellVolume', async () => {
      log(`
      =====================================
      T1: Check sellVolume
      =====================================
      `)

      sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
      const svFee = f => sellingAmount * (f / 100)
      log(`
      SELLVOLUMES === ${sellVolumes.toEth()}
      FEE         === ${svFee(0.5).toEth()}
      `)
      assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
    })

    it('BUYER1: Non Auction clearing PostBuyOrder + Claim => MGNs = 0', async () => {
      eventWatcher(dx, 'ClaimBuyerFunds', {})
      eventWatcher(dx, 'LogNumber', {})
      log(`
      ============================================================================================
      T2.5: Buyer1 PostBuyOrder => [[Non Auction clearing PostBuyOrder + Claim]] => [[MGNs = 0]]
      ============================================================================================
      `)
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      /*
       * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
       */
      await setAndCheckAuctionStarted(eth, gno)

      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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

      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 20GNO * 1/4 => 5 ETHER
       */
      await postBuyOrder(eth, gno, false, (20).toWei(), buyer1)
      log(`
      Buy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber() - ((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()) * (den / num)).toEth()}
      `)
      let idx = await getAuctionIndex()
      const [claimedFunds, mgnsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx)).map(i => i.toNumber())
      log(`
      CLAIMED FUNDS => ${claimedFunds.toEth()}
      MGN ISSUED => ${mgnsIssued.toEth()}
      `)

      assert.equal(mgnsIssued, 0, 'MGNs only issued / minted after auction Close so here = 0')
    })

    it(
      'BUYER1: Tries to lock and unlock MGNs --> Auction NOT cleared --> asserts 0 MGNs minted and in mapping',
      () => unlockMGNTokens(buyer1, eth, gno),
    )

    it('BUYER1: Auction clearing PostBuyOrder + Claim => MGNs = sellVolume', async () => {
      eventWatcher(dx, 'AuctionCleared')
      log(`
      ================================================================================================
      T3: Buyer1 PostBuyOrder => Auction clearing PostBuyOrder + Claim => MGNs = 99.5 || sellVolume
      ================================================================================================
      `)
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)

      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1)).map(i => i.toNumber())
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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
      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 20GNO * 1/4 => 5 ETHER
       */
      // post buy order that CLEARS auction - 400 / 4 = 100 + 5 from before clears
      await postBuyOrder(eth, gno, false, (400).toWei(), buyer1)
      log(`
      Buy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber() - ((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()) * (den / num)).toEth()}
      `)
      // drop it down 1 as Auction has cleared
      let idx = await getAuctionIndex() - 1
      const [claimedFunds, mgnsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx)).map(i => i.toNumber())
      await assertClaimingFundsCreatesMGNs(eth, gno, buyer1, 'buyer')
      log(`
      RETURNED//CLAIMED FUNDS => ${claimedFunds.toEth()}
      MGN ISSUED           => ${mgnsIssued.toEth()}
      `)

      assert.equal(mgnsIssued.toEth(), 99.5, 'MGNs only issued / minted after auction Close so here = 99.5 || sell Volume')
    })

    it('Clear Auction, assert auctionIndex increase', async () => {
      log(`
      ================================================================================================
      T3.5: Buyer1 Check Auc Idx + Make sure Buyer1 has returned ETH in balance
      ================================================================================================
      `)
      /*
       * SUB TEST 1: clearAuction
       */
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      // just to close auction
      // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
      log(`
      New Auction Index -> ${await getAuctionIndex()}
      `)
      assert.equal((await getBalance(buyer1, eth)), startBal.startingETH + sellVolumes, 'Buyer 1 has the returned value into ETHER + original balance')
      assert.isAtLeast(await getAuctionIndex(), 2)
    })

    it('BUYER1: ETH --> GNO: Buyer can lock tokens and only unlock them 24 hours later', async () => {
      // event listeners
      // eventWatcher(tokenMGN, 'NewTokensMinted')
      // eventWatcher(dx, 'AuctionCleared')
      log(`
      ============================================
      T4: Buyer1 - Locking and Unlocking of Tokens
      ============================================
      `)
      /*
       * SUB TEST 1: Try getting MGNs
       */
      // Claim Buyer Funds from auctionIdx 1
      await claimBuyerFunds(eth, gno, buyer1, 1)
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(buyer1)
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
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(seller1)
    })
  })

  describe('DX MGN Flow --> 1 Seller + 2 Buyers', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      /*
       * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
       */
      // add tokenPair ETH GNO
      log('Selling amt ', sellingAmount.toEth())
      await dx.addTokenPair(
        eth.address,
        gno.address,
        sellingAmount,  // 100 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
        0,              // buyVolume for GNO
        2,              // lastClosingPrice NUM
        1,              // lastClosingPrice DEN
        { from: seller1 },
      )
      seller1Balance = await getBalance(seller1, eth) // dx.balances(token) - sellingAmt
      log(`\nSeller Balance ====> ${seller1Balance.toEth()}\n`)
      assert.equal(seller1Balance, startingETH - sellingAmount, `Seller1 should have ${startingETH.toEth()} balance after new Token Pair add`)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    // Checks that sellVolume * calculated FEE is correct
    it('Check sellVolume', async () => {
      log(`
      =====================================
      T1: Check sellVolume
      =====================================
      `)

      sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
      const svFee = f => sellingAmount * (f / 100)
      log(`
      SELLVOLUMES === ${sellVolumes.toEth()}
      FEE         === ${svFee(0.5).toEth()}
      `)
      assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
    })

    // Starts the auction - sets block time to 1 sec AFTER auction time
    it('Start Auction', async () => {
      /*
       * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
       */
      await setAndCheckAuctionStarted(eth, gno)
    })


    it('BUYER1: [[Non Auction clearing PostBuyOrder + Claim]] => [[MGNs = 0]]', async () => {
      eventWatcher(dx, 'ClaimBuyerFunds')
      eventWatcher(dx, 'LogNumber')
      log(`
      ============================================================================================
      T-2a: Buyer1 PostBuyOrder => [[Non Auction clearing PostBuyOrder + Claim]] => [[MGNs = 0]]
      ============================================================================================
      `)

      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)

      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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
      /*
       * SUB TEST 2: postBuyOrder => 200 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 200GNO * 1/4 => 50 ETHER
       */
      await postBuyOrder(eth, gno, false, (200).toWei(), buyer1)
      log(`\nBuy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}`)
      let idx = await getAuctionIndex()
      const [claimedFunds, mgnsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx)).map(i => i.toNumber())
      log(`
      CLAIMED FUNDS => ${claimedFunds.toEth()}
      MGN ISSUED => ${mgnsIssued.toEth()}
      `)

      assert.equal(mgnsIssued, 0, 'MGNs only issued / minted after auction Close so here = 0')
    })

    it('Move time and change price to 50% of 4:1 aka 2:1 aka Last Closing Price', async () => {
      /*
       * SUB TEST 2: Move time to 3:1 price
       * @ price 3:1 aka 1 GNO => 1/3 ETH && 1 ETH => 3 GNO
       * @{return} ... 20GNO * 1/3 => 6.6666 ETHER
       */
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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
      assert.isAtLeast((num / den), 2.899999)
    })

    it('BUYER2: Non Auction clearing PostBuyOrder + Claim => MGNs = 0', async () => {
      eventWatcher(dx, 'ClaimBuyerFunds', {})
      eventWatcher(dx, 'LogNumber', {})
      log(`
      ============================================================================================
      T-2b: Buyer1 PostBuyOrder => [[Non Auction clearing PostBuyOrder + Claim]] => [[MGNs = 0]]
      ============================================================================================
      `)

      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer2, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer2, eth)).toEth()}
      `)

      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 3:1 price
       * post buy order @ price 3:1 aka 1 GNO => 1/3 ETH && 1 ETH => 3 GNO
       * @{return} ... 100GNO * 1/3 => 33.333 ETHER
       */
      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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
      await postBuyOrder(eth, gno, false, (40).toWei(), buyer2)
      log(`
      Buy Volume AFTER      = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()} GNO
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber() - ((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()) * (den / num)).toEth()} ETH
      `)

      const [claimedFunds, mgnsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer2, 1)).map(i => i.toNumber())
      log(`
      CLAIMED FUNDS => ${claimedFunds.toEth()} ETH
      MGN ISSUED => ${mgnsIssued.toEth()} MGN
      `)

      assert.equal(mgnsIssued, 0, 'MGNs only issued / minted after auction Close so here = 0')
    })

    it('BUYER1: Auction clearing PostBuyOrder + Claim => MGNs = sellVolume', async () => {
      eventWatcher(dx, 'AuctionCleared')
      log(`
      ================================================================================================
      T3: Buyer1 PostBuyOrder => Auction clearing PostBuyOrder + Claim => MGNs = 99.5 || sellVolume
      ================================================================================================
      `)
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 20GNO * 1/4 => 5 ETHER
       */
      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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

      // post buy order that CLEARS auction - 400 / 4 = 100 + 5 from before clears
      await postBuyOrder(eth, gno, false, (400).toWei(), buyer1)
      log(`
      Buy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber() - ((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()) * (den / num)).toEth()}
      `)
      let idx = await getAuctionIndex() - 1
      const [b1ClaimedFunds, b1MGNsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx)).map(i => i.toNumber())
      const [b2ClaimedFunds, b2MGNsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer2, idx)).map(i => i.toNumber())
      buyer1Returns = b1MGNsIssued
      buyer2Returns = b2MGNsIssued

      // Buyer1 Claim
      await assertClaimingFundsCreatesMGNs(eth, gno, buyer1, 'buyer')
      // Buyer2 Claim
      await assertClaimingFundsCreatesMGNs(eth, gno, buyer2, 'buyer')

      // Save return amt into state since MGN 1:1 w/ETH
      log(`
      Buyer 1
      RETURNED//CLAIMED FUNDS => ${b1ClaimedFunds.toEth()}
      MGN ISSUED           => ${b1MGNsIssued.toEth()}
      `)

      log(`
      Buyer 2
      RETURNED//CLAIMED FUNDS => ${b2ClaimedFunds.toEth()}
      MGN ISSUED           => ${b2MGNsIssued.toEth()}
      `)

      // assert both amount of mgns issued = sellVolume
      assert.equal((b1MGNsIssued + b2MGNsIssued).toEth(), 99.5, 'MGNs only issued / minted after auction Close so here = 99.5 || sell Volume')
    })

    it('Clear Auction, assert auctionIndex increase', async () => {
      log(`
      ================================================================================================
      T3.5: Buyer1 Check Auc Idx + Make sure Buyer1 has returned ETH in balance
      ================================================================================================
      `)
      /*
       * SUB TEST 1: clearAuction
       */
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      // just to close auction
      // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
      log(`
      New Auction Index -> ${await getAuctionIndex()}
      `)

      assert.equal(((await getBalance(buyer1, eth)).toEth()).toFixed(2), ((startBal.startingETH + buyer1Returns).toEth()).toFixed(2), 'Buyer 1 has the returned value into ETHER + original balance')
      assert.equal(((await getBalance(buyer2, eth)).toEth()).toFixed(2), ((startBal.startingETH + buyer2Returns).toEth()).toFixed(2), 'Buyer 2 has the returned value into ETHER + original balance')
      assert.equal(await getAuctionIndex(), 2)
    })

    it('BUYER1: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
      // event listeners
      // eventWatcher(tokenMGN, 'NewTokensMinted')
      // eventWatcher(dx, 'AuctionCleared')
      log(`
      ============================================
      T-4a: Buyer1 - Locking and Unlocking of Tokens
      ============================================
      `)
      /*
       * SUB TEST 1: Try getting MGNs
       */
      // Claim Buyer Funds from auctionIdx 1
      await claimBuyerFunds(eth, gno, buyer1, 1)
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(buyer1)
    })

    it('BUYER2: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
      // event listeners
      // eventWatcher(tokenMGN, 'NewTokensMinted')
      // eventWatcher(dx, 'AuctionCleared')
      log(`
      ============================================
      T-4b: Buyer2 - Locking and Unlocking of Tokens
      ============================================
      `)
      /*
       * SUB TEST 1: Try getting MGNs
       */
      // Claim Buyer Funds from auctionIdx 1
      await claimBuyerFunds(eth, gno, buyer2, 1)
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(buyer2)
    })

    it('SELLER: ETH --> GNO: seller can lock tokens and only unlock them 24 hours later', async () => {
      log(`
      ============================================
      T5: Seller - Locking and Unlocking of Tokens
      ============================================
      `)
      log('seller BALANCE = ', (await getBalance(seller1, eth)).toEth())
      await claimSellerFunds(eth, gno, seller1, 1)
      await unlockMGNTokens(seller1)
    })
  })

  describe('DX MGN Flow --> withdrawUnlockedTokens', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      /*
       * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
       */
      // add tokenPair ETH GNO
      log('Selling amt ', sellingAmount.toEth())
      await dx.addTokenPair(
        eth.address,
        gno.address,
        sellingAmount,  // 100 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
        0,              // buyVolume for GNO
        2,              // lastClosingPrice NUM
        1,              // lastClosingPrice DEN
        { from: seller1 },
      )
      seller1Balance = await getBalance(seller1, eth) // dx.balances(token) - sellingAmt
      log(`\nSeller Balance ====> ${seller1Balance.toEth()}\n`)
      assert.equal(seller1Balance, startingETH - sellingAmount, `Seller1 should have ${startingETH.toEth()} balance after new Token Pair add`)

    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('Check sellVolume', async () => {
      log(`
      =====================================
      T1: Check sellVolume
      =====================================
      `)

      sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
      const svFee = f => sellingAmount * (f / 100)
      log(`
      SELLVOLUMES === ${sellVolumes.toEth()}
      FEE         === ${svFee(0.5).toEth()}
      `)
      assert.equal(sellVolumes, sellingAmount - svFee(0.5), 'sellVolumes === seller1Balance')
    })

    it('BUYER1: Non Auction clearing PostBuyOrder + Claim => MGNs = 0', async () => {
      eventWatcher(dx, 'ClaimBuyerFunds', {})
      eventWatcher(dx, 'LogNumber', {})
      log(`
      ============================================================================================
      T2.5: Buyer1 PostBuyOrder => [[Non Auction clearing PostBuyOrder + Claim]] => [[MGNs = 0]]
      ============================================================================================
      `)
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      /*
       * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
       */
      await setAndCheckAuctionStarted(eth, gno)

      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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

      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 20GNO * 1/4 => 5 ETHER
       */
      await postBuyOrder(eth, gno, false, (20).toWei(), buyer1)
      log(`
      Buy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber() - ((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()) * (den / num)).toEth()}
      `)
      let idx = await getAuctionIndex()
      const [claimedFunds, mgnsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx)).map(i => i.toNumber())
      log(`
      CLAIMED FUNDS => ${claimedFunds.toEth()}
      MGN ISSUED => ${mgnsIssued.toEth()}
      `)

      assert.equal(mgnsIssued, 0, 'MGNs only issued / minted after auction Close so here = 0')
    })

    it(
      'BUYER1: Tries to lock and unlock MGNs --> Auction NOT cleared --> asserts 0 MGNs minted and in mapping',
      () => unlockMGNTokens(buyer1),
    )

    it('BUYER1: Auction clearing PostBuyOrder + Claim => MGNs = sellVolume', async () => {
      eventWatcher(dx, 'AuctionCleared')
      log(`
      ================================================================================================
      T3: Buyer1 PostBuyOrder => Auction clearing PostBuyOrder + Claim => MGNs = 99.5 || sellVolume
      ================================================================================================
      `)
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)

      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(eth.address, gno.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
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
      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 20GNO * 1/4 => 5 ETHER
       */
      // post buy order that CLEARS auction - 400 / 4 = 100 + 5 from before clears
      await postBuyOrder(eth, gno, false, (400).toWei(), buyer1)
      log(`
      Buy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber() - ((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()) * (den / num)).toEth()}
      `)
      // drop it down 1 as Auction has cleared
      let idx = await getAuctionIndex() - 1
      const [claimedFunds, mgnsIssued] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, idx)).map(i => i.toNumber())
      await assertClaimingFundsCreatesMGNs(eth, gno, buyer1, 'buyer')
      log(`
      RETURNED//CLAIMED FUNDS => ${claimedFunds.toEth()}
      MGN ISSUED           => ${mgnsIssued.toEth()}
      `)

      assert.equal(mgnsIssued.toEth(), 99.5, 'MGNs only issued / minted after auction Close so here = 99.5 || sell Volume')
    })

    it('Clear Auction, assert auctionIndex increase', async () => {
      log(`
      ================================================================================================
      T3.5: Buyer1 Check Auc Idx + Make sure Buyer1 has returned ETH in balance
      ================================================================================================
      `)
      /*
       * SUB TEST 1: clearAuction
       */
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      // just to close auction
      // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
      log(`
      New Auction Index -> ${await getAuctionIndex()}
      `)
      assert.equal((await getBalance(buyer1, eth)), startBal.startingETH + sellVolumes, 'Buyer 1 has the returned value into ETHER + original balance')
      assert.isAtLeast(await getAuctionIndex(), 2)
    })

    it('BUYER1: ETH --> GNO: Buyer can lock tokens and only unlock them 24 hours later', async () => {
      // event listeners
      // eventWatcher(tokenMGN, 'NewTokensMinted')
      // eventWatcher(dx, 'AuctionCleared')
      log(`
      ============================================
      T4: Buyer1 - Locking and Unlocking of Tokens
      ============================================
      `)
      /*
       * SUB TEST 1: Try getting MGNs
       */
      // Claim Buyer Funds from auctionIdx 1
      await claimBuyerFunds(eth, gno, buyer1, 1)
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(buyer1)
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
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(seller1)
    })

    it('BUYER1: Unlocked MGN tokens can be Withdrawn and Balances show for this', async () => {
      // MGN were minted
      // MGN were locked
      // MGN were UNLOCKED - starts 24h countdown
      // withdraw time MUST be < NOW aka MGN can be withdrawn

      /**
       * Sub-Test 1:
       * assert amount unlocked is not 0
       * move time 24 hours
       * assert withdrawTime is < now
       */
      const [amountUnlocked, withdrawTime] = (await tokenMGN.unlockedTokens.call(buyer1)).map(n => n.toNumber())
      assert(amountUnlocked !== 0 && amountUnlocked === sellVolumes, 'Amount unlocked isnt 0 aka there are mgns')
      // wait 24 hours
      await wait(86405)
      log(`
      amt unlocked  ==> ${amountUnlocked.toEth()}
      withdrawTime  ==> ${withdrawTime} ==> ${new Date(withdrawTime * 1000)}
      time now      ==> ${timestamp()}  ==> ${new Date(timestamp() * 1000)}
      `)
      assert(withdrawTime < timestamp(), 'withdrawTime must be < now')
      // withdraw them!
      await tokenMGN.withdrawUnlockedTokens({ from: buyer1 })
      /**
       * Sub Test 2:
       * assert balance[user] of MGN != 0
       */
      const userMGNBalance = (await tokenMGN.balanceOf.call(buyer1)).toNumber()
      log(`
      BUYER1 MGN Balance ===> ${userMGNBalance.toEth()}
      `)
      assert(userMGNBalance > 0 && userMGNBalance === sellVolumes, 'Buyer1 should have non 0 Token MGN balances')
    })

    it('SELLER1: Unlocked MGN tokens can be Withdrawn and Balances show for this', async () => {
      /**
       * Sub-Test 1:
       * assert amount unlocked is not 0
       * move time 24 hours
       * assert withdrawTime is < now
       */
      const [amountUnlocked, withdrawTime] = (await tokenMGN.unlockedTokens.call(seller1)).map(n => n.toNumber())
      assert(amountUnlocked !== 0 && amountUnlocked === sellVolumes, 'Amount unlocked isnt 0 aka there are mgns')
      // wait 24 hours
      await wait(86405)
      log(`
      amt unlocked  ==> ${amountUnlocked.toEth()}
      withdrawTime  ==> ${withdrawTime} ==> ${new Date(withdrawTime * 1000)}
      time now      ==> ${timestamp()}  ==> ${new Date(timestamp() * 1000)}
      `)
      assert(withdrawTime < timestamp(), 'withdrawTime must be < now')
      // withdraw them!
      await tokenMGN.withdrawUnlockedTokens({ from: seller1 })
      /**
       * Sub Test 2:
       * assert balance[user] of MGN != 0
       */
      const userMGNBalance = (await tokenMGN.balanceOf.call(seller1)).toNumber()
      log(`
      seller1 MGN Balance ===> ${userMGNBalance.toEth()}
      `)
      assert(userMGNBalance > 0 && userMGNBalance === sellVolumes, 'seller1 should have non 0 Token MGN balances')
    })
  })

  describe('DX MGN Flow --> change Owner', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      /*
       * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
       */
      // add tokenPair ETH GNO
      log('Selling amt ', sellingAmount.toEth())
      await dx.addTokenPair(
        eth.address,
        gno.address,
        sellingAmount,  // 100 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
        0,              // buyVolume for GNO
        2,              // lastClosingPrice NUM
        1,              // lastClosingPrice DEN
        { from: seller1 },
      )
      seller1Balance = await getBalance(seller1, eth) // dx.balances(token) - sellingAmt
      log(`\nSeller Balance ====> ${seller1Balance.toEth()}\n`)
      assert.equal(seller1Balance, startingETH - sellingAmount, `Seller1 should have ${startingETH.toEth()} balance after new Token Pair add`)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('CHANGING OWNER AND MINTER: changes MGN_OWNER from Master to Seller1 --> changes MGN_MINTER from NEW OWNER seller1 to seller1', async () => {
      const originalMGNOwner = await tokenMGN.owner.call()
      await tokenMGN.updateOwner(seller1, { from: master })
      const newMGNOwner = await tokenMGN.owner.call()

      assert(originalMGNOwner === master, 'Original owner should be accounts[0] aka master aka migrations deployed acct for tokenMGN')
      assert(newMGNOwner === seller1, 'New owner should be accounts[1] aka seller1')

      // set new Minter as seller1 - must come from MGN owner aka seller1
      await tokenMGN.updateMinter(seller1, { from: newMGNOwner })
      const newMGNMInter = await tokenMGN.minter.call()

      // assert.equal(originalMGNMinter, master, 'Original owner should be accounts[0] aka master aka migrations deployed acct for tokenMGN')
      assert.equal(newMGNMInter, seller1, 'New owner should be accounts[1] aka seller1')
    })
  })

  describe('DX MGN Flow --> 2 Sellers || MGN issuance', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      /*
       * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
       */
      // add tokenPair ETH GNO
      log('Selling amt ', sellingAmount.toEth())
      await dx.addTokenPair(
        eth.address,
        gno.address,
        sellingAmount,  // 100 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
        0,              // buyVolume for GNO
        2,              // lastClosingPrice NUM
        1,              // lastClosingPrice DEN
        { from: seller1 },
      );

      ([seller1Balance, seller2Balance] = await Promise.all(sellers.map(s => getBalance(s, eth))))
      assert.equal(seller1Balance, startingETH - sellingAmount, `Seller1 should have ${startingETH.toEth()} balance after new Token Pair add`)
      assert.equal(seller2Balance, startingETH, `Seller2 should still have balance of ${startingETH.toEth()}`)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('Seller2 posts sell order in same auction ... ', async () => {
      let aucIdx = await getAuctionIndex()
      await dx.postSellOrder(eth.address, gno.address, aucIdx, sellingAmount, { from: seller2 })
      sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()

      const postFeeSV = fee => ((sellingAmount * sellers.length) * (1 - (fee / 100))).toEth()

      log(`
      sV ==> ${sellVolumes.toEth()}
      `)

      assert.equal(sellVolumes.toEth(), postFeeSV(0.5), `SV should = ${sellingAmount.toEth() * 2}`)
    })

    it('Seller 3 posts a different amount', async () => {
      seller3SellAmount = 50..toWei()
      await dx.postSellOrder(eth.address, gno.address, 1, seller3SellAmount, { from: seller3 })
    })

    it('Move forward in time to end auction', async () => {
      // price is ~~ 2:1
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, 1, 600..toWei(), buyer1)

      const aucIdx = await getAuctionIndex()
      assert(aucIdx === 2, 'Auc ended and moved +1 idx')
    })

    it('Sellers 1 and 2 can take out their equal share of MGNs', () =>
      Promise.all(sellers.map(async (seller) => {
        await claimSellerFunds(eth, gno, seller, 1)
        let tulBal = (await tokenMGN.lockedTokenBalances.call(seller)).toNumber()
        log(tulBal)

        assert.equal(tulBal, sellVolumes / 2, 'MGNs minted should equal each sellers\' amount posted after FEES')
      })))

    it('Seller 3 can take out their smaller share', async () => {
      await claimSellerFunds(eth, gno, seller3, 1)
      const tulBal = (await tokenMGN.lockedTokenBalances.call(seller3)).toNumber()
      log(tulBal)

      assert.equal(tulBal, seller3SellAmount * 0.995, 'Seller 3 balance is their sell amount * fee')
    })
  })

  describe('DX MGN Flow --> 1 SellOrder && 1 BuyOrder', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      // allow the start of an auction w/no threshold
      await dx.updateThresholdNewTokenPair(0, { from: master })
      await dx.updateThresholdNewAuction(0, { from: master })
      /*
       * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
       */
      // add tokenPair ETH GNO
      log('Selling amt ', sellingAmount.toEth())
      await dx.addTokenPair(
        eth.address,
        gno.address,
        0,                 // 100 ether - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
        0,                // buyVolume for GNO
        2,               // lastClosingPrice NUM
        1,              // lastClosingPrice DEN
        { from: seller1 },
      )
      seller1Balance = await getBalance(seller1, eth) // dx.balances(token) - sellingAmt
      log(`\nSeller Balance ====> ${seller1Balance.toEth()}\n`)
      assert.equal(seller1Balance.toEth(), seller1Balance.toEth(), `Seller1 should have ${seller1Balance} balance after new Token Pair add`)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('1st --> POST SELL ORDER', async () => postSellOrder(eth, gno, 0, 5..toWei(), seller1))

    it('2nd --> POST SELL ORDER', async () => postSellOrder(eth, gno, 0, 5..toWei(), seller1))

    it('START AUCTION', async () => setAndCheckAuctionStarted(eth, gno))

    it('1st --> POST BUY ORDER', async () => postBuyOrder(eth, gno, 1, 1..toWei(), buyer1))

    it('2nd --> POST BUY ORDER', async () => postBuyOrder(eth, gno, 1, 1..toWei(), buyer1))

    it('WAIT UNTIL PRICE IS 2:1 <was 4:1>', async () => waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1))

    it('CLEAR AUCTION W/BUY ORDER', async () => postBuyOrder(eth, gno, 1, 400..toWei(), buyer1))

    it('ASSERTS AUCTION IDX === 2', async () => assert.equal(await getAuctionIndex(), 2, 'AucIdx should = 2'))
  })

  describe('DX MGN Flow --> Seller ERC20/ETH', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

      /*
       * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
       */
      // add tokenPair ETH GNO
      log('Selling amt ', sellingAmount.toEth())
      await dx.addTokenPair(
        eth.address,
        gno.address,
        sellingAmount,  // 100 amt - sellVolume for ETH - takes Math.min of amt passed in OR seller balance
        sellingAmount / 4,              // buyVolume for GNO
        2,              // lastClosingPrice NUM
        1,              // lastClosingPrice DEN
        { from: seller1 },
      )
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('Check sellVolume', async () => {
      log(`
      =====================================
      T1: Check sellVolume
      =====================================
      `)

      sellVolumes = (await dx.sellVolumesCurrent.call(gno.address, eth.address)).toNumber()
      const svFee = f => (sellingAmount / 4) * (f / 100)
      log(`
      SELLVOLUMES === ${sellVolumes.toEth()}
      FEE         === ${svFee(0.5).toEth()}
      `)
      assert.equal(sellVolumes, (sellingAmount / 4) - svFee(0.5), 'sellVolumes === seller1Balance')
    })

    it('BUYER1: Non Auction clearing PostBuyOrder + Claim => MGNs = 0', async () => {
      log(`
      ============================================================================================
      T2.5: Buyer1 PostBuyOrder => [[Non Auction clearing PostBuyOrder + Claim]] => [[MGNs = 0]]
      ============================================================================================
      `)
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      /*
       * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
       */
      await setAndCheckAuctionStarted(gno, eth)

      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(gno.address, eth.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(gno.address, eth.address, 1)).map(i => i.toNumber())
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

      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 20GNO * 1/4 => 5 ETHER
       */
      await postBuyOrder(gno, eth, false, (20).toWei(), buyer1)
      log(`
      Buy Volume AFTER = ${((await dx.buyVolumes.call(gno.address, eth.address)).toNumber()).toEth()}
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(gno.address, eth.address)).toNumber() - ((await dx.buyVolumes.call(gno.address, eth.address)).toNumber()) * (den / num)).toEth()}
      `)
      let idx = await getAuctionIndex()
      const [claimedFunds, mgnsIssued] = (await dx.claimBuyerFunds.call(gno.address, eth.address, buyer1, idx)).map(i => i.toNumber())
      log(`
      CLAIMED FUNDS => ${claimedFunds.toEth()}
      MGN ISSUED => ${mgnsIssued.toEth()}
      `)

      assert.equal(mgnsIssued, 0, 'MGNs only issued / minted after auction Close so here = 0')
    })

    it(
      'BUYER1: Tries to lock and unlock MGNs --> Auction NOT cleared --> asserts 0 MGNs minted and in mapping',
      () => unlockMGNTokens(buyer1, gno, eth),
    )

    it('BUYER1: Auction clearing PostBuyOrder + Claim => MGNs = sellVolume', async () => {
      eventWatcher(dx, 'AuctionCleared')
      log(`
      ================================================================================================
      T3: Buyer1 PostBuyOrder => Auction clearing PostBuyOrder + Claim => MGNs = 99.5 || sellVolume
      ================================================================================================
      `)
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)

      // Should be 0 here as aucIdx = 1 ==> we set aucIdx in this case
      const [closingNum, closingDen] = (await dx.closingPrices.call(gno.address, eth.address, 1))
      // Should be 4 here as closing price starts @ 2 and we times by 2
      const [num, den] = (await dx.getCurrentAuctionPrice.call(gno.address, eth.address, 1)).map(i => i.toNumber())
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
      /*
       * SUB TEST 2: postBuyOrder => 20 GNO @ 4:1 price
       * post buy order @ price 4:1 aka 1 GNO => 1/4 ETH && 1 ETH => 4 GNO
       * @{return} ... 20GNO * 1/4 => 5 ETHER
       */
      // post buy order that CLEARS auction - 400 / 4 = 100 + 5 from before clears
      await postBuyOrder(gno, eth, false, 5..toWei(), buyer1)
      log(`
      Buy Volume AFTER = ${((await dx.buyVolumes.call(gno.address, eth.address)).toNumber()).toEth()}
      Left to clear auction = ${((await dx.sellVolumesCurrent.call(gno.address, eth.address)).toNumber() - ((await dx.buyVolumes.call(gno.address, eth.address)).toNumber()) * (den / num)).toEth()}
      `)
      // drop it down 1 as Auction has cleared
      let idx = await getAuctionIndex() - 1

      // clear RECIP auction via buyer2
      await postBuyOrder(eth, gno, 1, 800..toWei(), buyer2)

      const [returned, mgnsIssued] = (await dx.claimBuyerFunds.call(gno.address, eth.address, buyer1, idx)).map(i => i.toNumber())
      await assertClaimingFundsCreatesMGNs(gno, eth, buyer1, 'buyer')
      log(`
      RETURNED//CLAIMED FUNDS => ${returned.toEth()}
      MGN ISSUED           => ${mgnsIssued.toEth()}
      `)

      assert.equal(mgnsIssued.toEth(), returned, 'MGNs only issued / minted after auction Close and are equal to returned amount')
    })

    it('Clear Auction, assert auctionIndex increase', async () => {
      log(`
      ================================================================================================
      T3.5: Buyer1 Check Auc Idx + Make sure Buyer1 has returned ETH in balance
      ================================================================================================
      `)
      /*
       * SUB TEST 1: clearAuction
       */
      log(`
      BUYER1 GNO BALANCE = ${(await getBalance(buyer1, gno)).toEth()}
      BUYER1 ETH BALANCE = ${(await getBalance(buyer1, eth)).toEth()}
      `)
      // just to close auction
      log(`
      New Auction Index -> ${await getAuctionIndex()}
      `)
      assert.equal((await getBalance(buyer1, gno)), startBal.startingGNO + sellVolumes, 'Buyer 1 has the returned value into GNO + original balance')
      assert.isAtLeast(await getAuctionIndex(), 2)
    })

    it('BUYER1: GNO --> ETH: Buyer can lock tokens and only unlock them 24 hours later', async () => {
      log(`
      ============================================
      T4: Buyer1 - Locking and Unlocking of Tokens
      ============================================
      `)
      /*
       * SUB TEST 1: Try getting MGNs
       */
      // Claim Buyer Funds from auctionIdx 1
      await claimBuyerFunds(gno, eth, buyer1, 1)
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(buyer1)
    })

    it('SELLER: GNO --> ETH: seller can lock tokens and only unlock them 24 hours later', async () => {
      log(`
      ============================================
      T5: Seller - Locking and Unlocking of Tokens
      ============================================
      `)
      log('seller BALANCE = ', (await getBalance(seller1, gno)).toEth())
      // await postBuyOrder(eth, gno, 1, 400..toWei(), buyer1)
      // just to close auction
      await claimSellerFunds(gno, eth, seller1, 1)
      // await checkUserReceivesMGNTokens(eth, gno, buyer1)
      await unlockMGNTokens(seller1)
    })
  })

})

const c2 = () => contract('DX MGN Flow --> ERC20:ERC20 --> 1 S + 1B', (accounts) => {
  const [master, seller1, seller2, buyer1] = accounts
  const participants = accounts.slice(1)
  const sellers = [seller1, seller2]
  let seller1Balance, seller2Balance
  let gno2

  const startBal = {
    startingETH: 1000..toWei(),
    startingGNO: 1000..toWei(),
    startingGNO2: 1000..toWei(),
    ethUSDPrice: 6000..toWei(),   // 400 ETH @ $6000/ETH = $2,400,000 USD
    sellingAmount: 10..toWei(), // Same as web3.toWei(50, 'gno')
    buyingAmount: 5..toWei(),
  }
  const {
    startingETH,
    sellingAmount,
    startingGNO,
    startingGNO2,
    // ethUSDPrice,
  } = startBal

  before('Before checks', async () => {
    // get contracts
    await setupContracts();
    /*
     * SUB TEST 1: Check passed in ACCT has NO balances in DX for token passed in
     */
    ([seller1Balance, seller2Balance] = await Promise.all(sellers.map(s => getBalance(s, gno))))
    assert.equal(seller1Balance, 0, 'Seller1 should have 0 balance')
    assert.equal(seller2Balance, 0, 'Seller2 should have 0 balance')

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    // create new ERC20 token &&
    // assign said token to gasLogger contracts obj
    contracts.gno2 = await TokenGNO2.new(10000..toWei(), { from: master });
    ({ gno2 } = contracts)

    // fund gno2 - deposit in DX
    await Promise.all(participants.map((acc) => {
      /* eslint array-callback-return:0 */
      gno2.transfer(acc, startingGNO2, { from: master })
      gno2.approve(dx.address, startingGNO2, { from: acc })
    }))
    await Promise.all(participants.map(acc => dx.deposit(gno2.address, startingGNO2, { from: acc })));

    /*
     * SUB TEST 2: Check passed in ACCT has NO balances in DX for token passed in
     */
    ([seller1Balance, seller2Balance] = await Promise.all(sellers.map(s => getBalance(s, gno))))
    assert.equal(seller1Balance, startingGNO, `Seller1 should have balance of ${startingGNO.toEth()}`)
    assert.equal(seller2Balance, startingGNO, `Seller2 should have balance of ${startingGNO.toEth()}`)
    // Assert GNO2 balance is NOT 0
    await Promise.all(participants.map(async acc => assert.isAbove(await dx.balances.call(gno2.address, acc), 0, 'Should not have 0 balance')))

    /*
     * SUB TEST 3: assert both eth and gno get approved by DX
     */
    // approve ETH

    await dx.updateApprovalOfToken([eth.address], true, { from: master })
    // approve GNO
    await dx.updateApprovalOfToken([gno.address], true, { from: master })
    // approve GNO2
    await dx.updateApprovalOfToken([gno2.address], true, { from: master })

    assert.equal(await dx.approvedTokens.call(eth.address), true, 'ETH is approved by DX')
    assert.equal(await dx.approvedTokens.call(gno.address), true, 'GNO is approved by DX')
    assert.equal(await dx.approvedTokens.call(gno2.address), true, 'GNO2 is approved by DX')

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10.0.toWei(),      // 10 - sellVolume for token1 - takes Math.min of amt passed in OR seller balance
      5.0.toWei(),      // starting buyVolume for token2
      2,               // lastClosingPrice NUM
      1,              // lastClosingPrice DEN
      { from: seller1 },
    )
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, startingETH - sellingAmount, `ETH///GNO: Seller1 should have ${startingETH.toEth()} balance after new Token Pair add`)

    // add tokenPair ETH GNO2
    await dx.addTokenPair(
      eth.address,
      gno2.address,
      10.0.toWei(),      // 10 - sellVolume for token1 - takes Math.min of amt passed in OR seller balance
      5.0.toWei(),      // starting buyVolume for token2
      1,               // lastClosingPrice NUM
      1,              // lastClosingPrice DEN
      { from: seller1 },
    )
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, startingETH - (sellingAmount * 2), `ETH//GNO2: Seller1 should have ${startingGNO.toEth()} balance after new Token Pair add`)

    // add tokenPair GNO GNO2
    await dx.addTokenPair(
      gno.address,
      gno2.address,
      10.0.toWei(),      // 10 - sellVolume for token1 - takes Math.min of amt passed in OR seller balance
      1.0.toWei(),      // starting buyVolume for token2
      1,               // lastClosingPrice NUM
      2,              // lastClosingPrice DEN
      { from: seller1 },
    )
    seller1Balance = await getBalance(seller1, gno)
    assert.isAtLeast(seller1Balance.toEth(), (startingGNO - (sellingAmount + 5.0.toWei())).toEth(), `GNO//GNO2: Seller1 should have ${startingGNO.toEth()} balance after new Token Pair add`)
  })

  afterEach(() => {
    gasLogger()
    eventWatcher.stopWatching()
  })

  it('ETH//GNO: Wait until price is low then CLOSE AUCTION', async () => {
    // grab current auction Index
    const startingAI = await getAuctionIndex(eth, gno)
    // move to 2:1 price (250 GNO => 125 ETHER)
    await setAndCheckAuctionStarted(eth, gno)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.5)

    await postBuyOrder(eth, gno, 1, 100.0.toWei(), buyer1)
    // clear recip
    await postBuyOrder(gno, eth, 1, 100.0.toWei(), buyer1)
    // Should be 4 here as closing price starts @ 2 and we times by 2
    const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, 1)).map(i => i.toNumber())
    log(`
    Buy Volume AFTER = ${((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()).toEth()}
    Left to clear auction = ${((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber() - ((await dx.buyVolumes.call(eth.address, gno.address)).toNumber()) * (den / num)).toEth()}
    `)
    const assertingAI = await getAuctionIndex(eth, gno)
    assert.equal(assertingAI, startingAI + 1, `Current Auction Index should == ${startingAI} + 1`)
  })

  it('ETH//GNO2: Wait until price is low then CLOSE AUCTION', async () => {
    // grab current auction Index
    const startingAI = await getAuctionIndex(eth, gno2)
    await setAndCheckAuctionStarted(eth, gno2)
    // move to 2:1 price (250 GNO => 125 ETHER)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno2, 0.5)

    // clear main
    await postBuyOrder(eth, gno2, 1, 100.0.toWei(), buyer1)
    // clear recip auction
    await postBuyOrder(gno2, eth, 1, 100.0.toWei(), buyer1)
    const assertingAI = await getAuctionIndex(eth, gno2)
    assert.equal(assertingAI, startingAI + 1, `Current Auction Index should == ${startingAI} + 1`)
  })

  it('GNO//GNO2: Wait until price is low then CLOSE AUCTION', async () => {
    // grab current auction Index
    const startingAI = await getAuctionIndex(gno, gno2)
    await setAndCheckAuctionStarted(gno, gno2)
    // move to 2:1 price (250 GNO => 125 ETHER)
    await waitUntilPriceIsXPercentOfPreviousPrice(gno, gno2, 0.2)

    // clear main auc
    await postBuyOrder(gno, gno2, 1, 25.0.toWei(), buyer1)
    // clear recip
    await postBuyOrder(gno2, gno, 1, 25.0.toWei(), buyer1)
    const assertingAI = await getAuctionIndex(gno, gno2)
    assert.equal(assertingAI, startingAI + 1, `Current Auction Index should == ${startingAI} + 1`)
  })

  it('Calculate that PROPER MGN amt is minted', async () => {
    // assuming all auctions: E/G, E/G2, G/G2 are CLOSED
    /** MGN minting guide
     * ETH/ERC20
     * --> Buyer (ERC20)
     * ------> MGN = buyerBalance * (price.den / price.num) <== closingPrice
     * --> Seller (ETH)
     * ------> MGN = sellerBalance (1:1 conversion)
     *
     * ERC20/ETH
     * --> Buyer (ETH)
     * ------> MGN = buyerBalance (1:1 conversion)
     * --> Seller (ERC20)
     * ------> MGN = returned AKA sellerBalance * (price.num / price.den)
     *
     * ERC20/ERC20
     * --> Buyer (ERC20)
     * ------> MGN = buyerBalance * (priceETHden / priceETHnum)
     * --> Seller (ERC20)
     * ------> MGN = returned AKA sellerBalance * (price.num / price.den)
     *
     */

    // seller
    await assertReturnedPlusMGNs(eth, gno, seller1, 'seller', 1, eth)
    await assertReturnedPlusMGNs(eth, gno2, seller1, 'seller', 1, eth)
    await assertReturnedPlusMGNs(gno, gno2, seller1, 'seller', 1, eth)

    // buyer
    await assertReturnedPlusMGNs(eth, gno, buyer1, 'buyer', 1, eth)
    await assertReturnedPlusMGNs(eth, gno2, buyer1, 'buyer', 1, eth)
    await assertReturnedPlusMGNs(gno, gno2, buyer1, 'buyer', 1, eth)
  })

  it('Buyer1 => can claim all MGN from all auctions', async () => {
    // ETH/GNO
    await assertClaimingFundsCreatesMGNs(eth, gno, buyer1, 'buyer')
    // ETH/GNO2
    await assertClaimingFundsCreatesMGNs(eth, gno2, buyer1, 'buyer')
    // GNO/GNO2
    await assertClaimingFundsCreatesMGNs(gno, gno2, buyer1, 'buyer')
  })

  it('Seller1 can take out his/her share of MGN', async () => {
    // ETH/GNO
    await assertClaimingFundsCreatesMGNs(eth, gno, seller1, 'seller')
    // ETH/GNO2
    await assertClaimingFundsCreatesMGNs(eth, gno2, seller1, 'seller')
    // GNO/GNO2
    await assertClaimingFundsCreatesMGNs(gno, gno2, seller1, 'seller')
  })
})

// conditionally start contracts
enableContractFlag(c1, c2)
