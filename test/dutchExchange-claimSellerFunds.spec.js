/* global contract, assert */
/* eslint no-undef: "error" */

/* Fee Reduction Token issuing is tested seperately in dutchExchange-MGN.js */

const {
  BN,
  BN_ZERO,
  eventWatcher,
  assertRejects,
  gasLogger,
  timestamp,
  makeSnapshot,
  revertSnapshot
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  getClearingTime,
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
  contracts = await getContracts();
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

contract('DutchExchange - claimSellerFunds', accounts => {
  const [master, seller1, seller2, buyer1, buyer2] = accounts
  // Accounts to fund for faster setupTest
  const setupAccounts = [master, seller1, seller2, buyer1, buyer2]
  const totalSellAmount2ndAuction = 10.0.toWei()
  const totalBuyAmount = 20.0.toWei()
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

  it('1. check for a throw, if auction is not yet ended', async () => {
    const auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    await assertRejects(dx.claimSellerFunds(eth.address, gno.address, seller1, auctionIndex))
    await assertRejects(dx.claimSellerFunds(eth.address, gno.address, seller1, auctionIndex + 1))
  })

  it(' 2. check for a throw, if seller contribution == 0', async () => {
    // prepare by clearing auction
    let auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer1)

    // check that clearingTime was saved
    const clearingTime = await getClearingTime(gno, eth, auctionIndex)
    const now = await timestamp()
    assert.equal(clearingTime, now, 'clearingTime was set')

    auctionIndex = await getAuctionIndex()
    // await setAndCheckAuctionStarted(eth, gno)
    assert.equal(2, auctionIndex)

    // check condition
    assert.equal((await dx.sellerBalances.call(eth.address, gno.address, 1, seller2)).toNumber(), 0)
    // now claiming should not be possible and return == 0
    await assertRejects(dx.claimSellerFunds(eth.address, gno.address, seller2, 1))
  })

  it(' 3. check for the correct return value', async () => {
    const auctionIndex = await getAuctionIndex()
    const { returned: claimedAmount } = await dx.claimSellerFunds.call(eth.address, gno.address, seller1, auctionIndex - 1)
    const { num: closingPriceNum } = await dx.closingPrices.call(eth.address, gno.address, auctionIndex - 1)
    assert.equal(claimedAmount.toString(), closingPriceNum.toString())
  })

  describe('4. Test claim after selling', () => {
    let globalSnapshotId
    let currentSnapshotId

    before(async () => {
      globalSnapshotId = await makeSnapshot()

      const auctionIndex = await getAuctionIndex()

      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction.div(new BN('5')), seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction.div(new BN('5')), seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction.mul(new BN('3')).div(new BN('5')), seller1)
      await postSellOrder(eth, gno, 0, totalSellAmount2ndAuction.div(new BN('10')), buyer2)

      // closing new auction
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)
      await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer2)
    })

    beforeEach(async () => {
      currentSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    after(async () => {
      await revertSnapshot(globalSnapshotId)
    })

    it('4.1. It should claim seller funds in an auction with 2 sellers', async () => {
      // Get closed auction index (created in 'before' test section)
      const auctionIndex = (await getAuctionIndex()) - 1

      // withdraw and check the balance change
      const seller1BalanceBefore = await dx.balances.call(eth.address, seller1)
      const seller2BalanceBefore = await dx.balances.call(eth.address, seller2)
      await dx.claimSellerFunds(gno.address, eth.address, seller2, auctionIndex)
      await dx.claimSellerFunds(gno.address, eth.address, seller1, auctionIndex)
      const seller1BalanceAfter = await dx.balances.call(eth.address, seller1)
      const seller2BalanceAfter = await dx.balances.call(eth.address, seller2)
      const { num: closingPriceNum } = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
      assert.equal(seller1BalanceBefore.add(closingPriceNum.mul(new BN('3')).div(new BN('5'))).toString(), seller1BalanceAfter.toString())
      assert.equal(seller2BalanceBefore.add(closingPriceNum.mul(new BN('2')).div(new BN('5'))).toString(), seller2BalanceAfter.toString())

      // check that the sellerBalances is set to 0
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
    })

    it('4.2. It should claim and withdraw seller funds in an auction with 2 sellers', async () => {
      // Get closed auction index (created in 'before' test section)
      const auctionIndex = (await getAuctionIndex()) - 1

      // withdraw and check the balance change
      const { returned: claimableAmtS1 } = await dx.claimSellerFunds.call(gno.address, eth.address, seller1, auctionIndex)
      const { returned: claimableAmtS2 } = await dx.claimSellerFunds.call(gno.address, eth.address, seller2, auctionIndex)
      const seller1ETHBal = await dx.balances.call(eth.address, seller1)
      const seller2ETHBal = await dx.balances.call(eth.address, seller2)

      // claim claimable tokens and withdraw at same time
      await dx.claimAndWithdraw(gno.address, eth.address, seller2, auctionIndex, 10000.0.toWei(), { from: seller2 })
      await dx.claimAndWithdraw(gno.address, eth.address, seller1, auctionIndex, 10000.0.toWei(), { from: seller1 })

      const seller1ETHBalAfter = (await eth.balanceOf.call(seller1)).toString()
      const seller2ETHBalAfter = (await eth.balanceOf.call(seller2)).toString()

      // check that the sellerBalances is set to 0
      // assert that balance in DX of ETH + ClaimedAndWithdraw-n amount = correct amount
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
      assert.equal(seller1ETHBalAfter, seller1ETHBal.add(claimableAmtS1).toString())
      assert.equal(seller2ETHBalAfter, seller2ETHBal.add(claimableAmtS2).toString())
    })

    it('5.1. It should claim seller funds from multiple auctions with 2 sellers', async () => {
      // Get closed auction index (created in 'before' test section)
      const auctionIndex = (await getAuctionIndex()) - 1

      await postSellOrder(gno, eth, 0, 5.0.toWei(), seller1)
      await postSellOrder(gno, eth, 0, 5.0.toWei(), seller2)
      await postSellOrder(eth, gno, 0, 10.0.toWei(), seller1)
      const auctionIndex2 = await getAuctionIndex()
      assert.equal(auctionIndex2, 3)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex + 1, totalBuyAmount, buyer1)

      // withdraw and check the balance change
      const seller1BalanceBefore = await dx.balances.call(eth.address, seller1)
      const seller2BalanceBefore = await dx.balances.call(eth.address, seller2)
      await dx.claimTokensFromSeveralAuctionsAsSeller(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller2)
      await dx.claimTokensFromSeveralAuctionsAsSeller(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller1)
      const seller1BalanceAfter = await dx.balances.call(eth.address, seller1)
      const seller2BalanceAfter = await dx.balances.call(eth.address, seller2)
      const { num: closingPrice1Num } = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
      const { num: closingPrice2Num } = await dx.closingPrices.call(gno.address, eth.address, auctionIndex + 1)
      const seller1BalanceCalc = seller1BalanceBefore.add(closingPrice1Num.mul(new BN('3')).div(new BN('5')))
        .add(closingPrice2Num.div(new BN('2')))
      const seller2BalanceCalc = seller2BalanceBefore.add(closingPrice1Num.mul(new BN('2')).div(new BN('5')))
        .add(closingPrice2Num.div(new BN('2')))
      assert.equal(seller1BalanceCalc.toString(), seller1BalanceAfter.toString())
      assert.equal(seller2BalanceCalc.toString(), seller2BalanceAfter.toString())

      // check that the sellerBalances is set to 0
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
    })

    it('5.2. It should claim and withdraw seller funds from multiple auctions with 2 sellers', async () => {
      // Get closed auction index (created in 'before' test section)
      const auctionIndex = (await getAuctionIndex()) - 1

      await postSellOrder(gno, eth, 0, 5.0.toWei(), seller1)
      await postSellOrder(gno, eth, 0, 5.0.toWei(), seller2)
      await postSellOrder(eth, gno, 0, 10.0.toWei(), seller1)
      const auctionIndex2 = await getAuctionIndex()
      assert.equal(auctionIndex2, 3)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex + 1, totalBuyAmount, buyer1)

      // withdraw and check the balance change
      // Result is an object with prop '0' and '1'. This happens because they have to be unnamed arrays in the contract
      // Each prop contains claimedAmounts and frtsIssued
      const claimableAmtS1 = await dx.claimTokensFromSeveralAuctionsAsSeller.call(
        [gno.address, gno.address],
        [eth.address, eth.address],
        [auctionIndex, auctionIndex + 1],
        seller1
      )
      // Result is an object with prop '0' and '1'. This happens because they have to be unnamed arrays in the contract
      // Each prop contains claimedAmounts and frtsIssued
      const claimableAmtS2 = await dx.claimTokensFromSeveralAuctionsAsSeller.call(
        [gno.address, gno.address],
        [eth.address, eth.address],
        [auctionIndex, auctionIndex + 1],
        seller2
      )

      // Object.keys reason explained in the comment above in call method
      const claimedAmountsS1 = claimableAmtS1[Object.keys(claimableAmtS1)[0]]
        .reduce((acc, amount) => {
          return acc.add(amount)
        }, BN_ZERO)
      // Object.keys reason explained in the comment above in call method
      const claimedAmountsS2 = claimableAmtS2[Object.keys(claimableAmtS2)[0]]
        .reduce((acc, amount) => {
          return acc.add(amount)
        }, BN_ZERO)

      const seller1ETHBal = (await dx.balances.call(eth.address, seller1)).toString()
      const seller2ETHBal = (await dx.balances.call(eth.address, seller2)).toString()
      // Not deposited seller balances
      const seller1NotDepositedETHBal = (await eth.balanceOf.call(seller1))
      const seller2NotDepositedETHBal = (await eth.balanceOf.call(seller2))

      // claim claimable tokens and withdraw at same time
      await dx.claimAndWithdrawTokensFromSeveralAuctionsAsSeller(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], { from: seller1 })
      await dx.claimAndWithdrawTokensFromSeveralAuctionsAsSeller(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], { from: seller2 })

      // check that the sellerBalances is set to 0
      // assert that balance in DX of ETH + ClaimedAndWithdraw-n amount = correct amount
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toString(), '0')
      assert.equal(seller1NotDepositedETHBal.add(claimedAmountsS1).toString(), (await eth.balanceOf.call(seller1)).toString())
      assert.equal(seller2NotDepositedETHBal.add(claimedAmountsS2).toString(), (await eth.balanceOf.call(seller2)).toString())
      // assert that claimed and withdrawed the amount (same deposited in DX)
      assert.equal(seller1ETHBal, (await dx.balances.call(eth.address, seller1)).toString())
      assert.equal(seller2ETHBal, (await dx.balances.call(eth.address, seller2)).toString())
    })
  })
})
