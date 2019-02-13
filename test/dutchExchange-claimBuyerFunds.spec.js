/* global contract, assert */
/* eslint no-undef: "error" */

/*
MGN token issuing will not be covered in these tests, as they are covered in the magnolia testing scripts
*/

const {
  BN,
  BN_ZERO,
  eventWatcher,
  assertRejects,
  logger,
  gasLogger,
  timestamp,
  makeSnapshot,
  revertSnapshot,
  valMinusFee
} = require('./utils')

const {
  setupTest,
  getContracts,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  setAndCheckAuctionStarted,
  postBuyOrder,
  postSellOrder,
  getClearingTime
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

contract('DutchExchange - claimBuyerFunds', accounts => {
  const [, seller1, seller2, buyer1, buyer2] = accounts
  const totalSellAmount2ndAuction = 10.0.toWei()
  const totalBuyAmount = 20.0.toWei()

  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

    eventWatcher(dx, 'Log', {})
  })

  after(eventWatcher.stopWatching)

  let currentSnapshotId

  afterEach(gasLogger)

  describe('Running dependant tests', () => {
    before(async () => {
      currentSnapshotId = await makeSnapshot()

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
      await setAndCheckAuctionStarted(eth, gno)

      // await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
      eventWatcher.stopWatching()
    })

    it(' 2. checks that the return value == 0, if price.num == 0 ', async () => {
      // prepare test by starting and clearing new auction
      let auctionIndex = await getAuctionIndex()
      await Promise.all([
        postSellOrder(gno, eth, 0, totalSellAmount2ndAuction, seller2),
        postSellOrder(eth, gno, 0, totalSellAmount2ndAuction, seller2)
      ])
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer1)

      // check that clearingTime was saved
      const now = await timestamp()
      const clearingTime = await getClearingTime(gno, eth, auctionIndex)
      assert.equal(clearingTime, now, 'clearingTime was set')

      auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      assert.equal(2, auctionIndex)

      // now claiming should not be possible and return == 0
      const { num: closingPriceNum } =
        await dx.closingPrices.call(gno.address, eth.address, auctionIndex - 1)
      // checking that test is executed correctly
      assert.isTrue(closingPriceNum.isZero())
      // logger('here it is', closingPriceNum)

      const { returned: claimedAmount } =
        await dx.claimBuyerFunds.call(gno.address, eth.address, buyer1, auctionIndex - 1)
      // checking that right amount is claimed
      assert.isTrue(claimedAmount.isZero())
    })

    // FIXME this test is dependent from the previous ones
    it('4. check right amount of coins is returned by claimBuyerFunds if auction is not closed', async () => {
      const auctionIndex = await getAuctionIndex()

      // prepare test by starting and closing theoretical auction
      await waitUntilPriceIsXPercentOfPreviousPrice(gno, eth, 1)
      await postBuyOrder(gno, eth, auctionIndex, totalSellAmount2ndAuction.div(new BN('4')), buyer2)

      // checking that closingPriceToken.num == 0
      const { num: closingPriceNumToken } =
        await dx.closingPrices.call(eth.address, gno.address, auctionIndex)
      assert.equal(closingPriceNumToken, 0)

      // actual testing at time with previous price
      const [
        { returned: claimedAmount },
        { num, den },
        sellVolume,
        buyVolume
      ] = await Promise.all([
        dx.claimBuyerFunds.call(gno.address, eth.address, buyer2, auctionIndex),
        dx.getCurrentAuctionPrice.call(gno.address, eth.address, auctionIndex),
        dx.sellVolumesCurrent.call(gno.address, eth.address),
        dx.buyVolumes.call(gno.address, eth.address)
      ])
      logger('buyVolume', buyVolume)
      logger('num', num)
      logger('den', den)

      let oustandingVolume = (sellVolume.mul(num).div(den)).sub(buyVolume)
      logger('oustandingVolume', oustandingVolume.toString())

      // As a running auction may lead to some precision errors in price is better
      // to check that difference is minimum
      let difference = (valMinusFee(totalSellAmount2ndAuction).mul(buyVolume).div(buyVolume.add(oustandingVolume)))
        .sub(claimedAmount).abs().toNumber()
      assert.isAtMost(difference, 5)

      // actual testing at time with previous 1/3 price
      await waitUntilPriceIsXPercentOfPreviousPrice(gno, eth, 1 / 3)
      const [
        { returned: claimedAmount2 },
        { num: num2, den: den2 },
        sellVolume2,
        buyVolume2
      ] = await Promise.all([
        dx.claimBuyerFunds.call(gno.address, eth.address, buyer2, auctionIndex),
        dx.getCurrentAuctionPrice.call(gno.address, eth.address, auctionIndex),
        dx.sellVolumesCurrent.call(gno.address, eth.address),
        dx.buyVolumes.call(gno.address, eth.address)
      ])
      oustandingVolume = (sellVolume2.mul(num2).div(den2)).sub(buyVolume2)
      logger('oustandingVolume', oustandingVolume)
      logger('buyVolume', buyVolume)
      // Once the auction is theoretical closed, price should stop and precision
      // should be maximum
      assert.equal(
        valMinusFee(totalSellAmount2ndAuction).mul(buyVolume2).div(buyVolume2.add(oustandingVolume)).toString(),
        claimedAmount2.toString())
    })
  })

  describe('Tests starting after adding token pair', () => {
    let localSnapshotId
    before(async () => {
      currentSnapshotId = await makeSnapshot()

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

      await setAndCheckAuctionStarted(eth, gno)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('1. check for a throw, if auctionIndex is bigger than the latest auctionIndex', async () => {
      // GIVEN a running token pair
      const auctionIndex = await getAuctionIndex()
      await assertRejects(dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex + 1))
    })

    it('3. checks that a non-buyer can not claim any returns', async () => {
      // GIVEN a running token pair
      const { returned: claimedAmount } =
        await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, 0)
      assert.equal(claimedAmount.toString(), '0')
    })

    it('5. check right amount of coins is returned by claimBuyerFunds if auction is not closed, but closed theoretical ', async () => {
      // prepare test by starting and clearing new auction
      const auctionIndex = await getAuctionIndex()
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei(), buyer1)

      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)

      // checking that closingPriceToken.num == 0
      const { num: closingPriceNumToken } =
        await dx.closingPrices.call(eth.address, gno.address, auctionIndex)
      assert.equal(closingPriceNumToken.toString(), '0')

      // actual testing
      const { returned: claimedAmount } =
        await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal(valMinusFee(10.0.toWei()).toString(), claimedAmount.toString())

      // claimBuyerFunds also clears the auction
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      // test clearingTime
      const clearingTime = await getClearingTime(eth, gno, auctionIndex)
      // clearingTime is set
      assert.isAbove(clearingTime, 5, 'clearingTime for theoretical auction')
    })

    it('6. check that already claimedBuyerfunds are substracted properly', async () => {
      // prepare test by starting and clearing new auction
      const auctionIndex = await getAuctionIndex()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei(), buyer1)

      // first withdraw
      const { returned: claimedAmount } =
        await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)
      const { num, den } =
        await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal(
        valMinusFee(10.0.toWei()).mul(den).div(num).toString(),
        claimedAmount.toString())

      const { num: num2, den: den2 } =
        await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)
      logger('num', num2)
      logger('den', den2)

      // second withdraw
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei(), buyer1)

      const { returned: claimedAmount2 } = await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal(
        valMinusFee(10.0.toWei()).sub(valMinusFee(10.0.toWei()).mul(den2).div(num2)).toString(),
        claimedAmount2.toString())
    })
  })

  describe('Tests starting after two auctions cleared', () => {
    let localSnapshotId
    before(async () => {
      currentSnapshotId = await makeSnapshot()

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

      // prepare test by starting and clearing new auction
      let auctionIndex = await getAuctionIndex()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await Promise.all([
        postBuyOrder(eth, gno, auctionIndex, 20.0.toWei(), buyer1),
        postSellOrder(eth, gno, 0, 10.0.toWei(), seller1),
        postSellOrder(gno, eth, 0, 10.0.toWei(), seller1)
      ])

      // check that clearingTime was saved (previous auction cleared)
      const now = await timestamp()
      const clearingTime = await getClearingTime(gno, eth, auctionIndex)
      let difference = Math.abs(clearingTime - now)
      assert.isAtMost(difference, 5, 'clearingTime was set')
      auctionIndex = await getAuctionIndex()
      assert.equal(auctionIndex, 2)

      // start and clear a second auction
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.6)
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei(), buyer1)
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei(), buyer2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.6)
      await postBuyOrder(eth, gno, auctionIndex, 10.0.toWei(), buyer2)
    })

    beforeEach(async () => {
      localSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(localSnapshotId)
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('7. check that extraTokens are distributed correctly', async () => {
      // GIVEN a token pair with two closed auctions in wich buyer1 participated
      const auctionIndex = await getAuctionIndex()
      assert.equal(auctionIndex, 2)

      const extraTokensAvailable = await dx.extraTokens.call(eth.address, gno.address, 2)

      // Check extra Token balance
      const { returned: claimedAmount } =
        await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)
      const { num, den } =
        await dx.closingPrices.call(eth.address, gno.address, auctionIndex)

      assert.equal(
        (valMinusFee(10.0.toWei()).mul(den).div(num)).add(extraTokensAvailable.div(new BN('2'))).toString(),
        claimedAmount.toString())
    })

    it('8. check that the actual accounting of balances is done correctly', async () => {
      // GIVEN a token pair with two closed auctions in wich buyer1 participated
      const auctionIndex = await getAuctionIndex()
      assert.equal(auctionIndex, 2)

      const extraTokensAvailable = await dx.extraTokens.call(eth.address, gno.address, 2)
      const balanceOfBuyer1 = await dx.balances.call(eth.address, buyer1)
      const { returned: claimedAmount } =
        await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)
      const { num, den } =
        await dx.closingPrices.call(eth.address, gno.address, auctionIndex)
      // await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal(
        ((valMinusFee(10.0.toWei())).mul(den).div(num)).add(extraTokensAvailable.div(new BN('2'))).toString(),
        claimedAmount.toString())

      // check that the token balances have been manipulated correctly
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal(
        (balanceOfBuyer1.add(claimedAmount)).toString(),
        (await dx.balances.call(eth.address, buyer1)).toString()
      )
    })

    it('9. should claim from several auctions as a buyer', async () => {
      // GIVEN a token pair with two closed auctions in wich buyer1 participated
      const auctionIndex = await getAuctionIndex()
      assert.equal(auctionIndex, 2)
      const balanceOfBuyer1 = await dx.balances.call(eth.address, buyer1)

      // WHEN we claim tokens from several auctions as a buyer
      // We have to repeat addresses because we can't pass multilevel array for indices
      // Result is an object with prop '0' and '1'. This happens because they have to be unnamed arrays in the contract
      // Each prop contains claimedAmounts and frtsIssued
      const claimableAmounts = await dx.claimTokensFromSeveralAuctionsAsBuyer.call(
        [eth.address, eth.address], // sellTokens
        [gno.address, gno.address], // buyTokens
        [1, 2], // Auction indices
        buyer1
      )
      // Object.keys reason explained in the comment above in call method
      const claimedAmounts = claimableAmounts[Object.keys(claimableAmounts)[0]]
        .reduce((acc, amount) => {
          return acc.add(amount)
        }, BN_ZERO)

      // THEN after claiming balance of buyer1 should match previous balance plus claimed amount
      await dx.claimTokensFromSeveralAuctionsAsBuyer(
        [eth.address, eth.address], [gno.address, gno.address], [1, 2], buyer1)
      assert.equal(
        balanceOfBuyer1.add(claimedAmounts).toString(),
        (await dx.balances.call(eth.address, buyer1)).toString())
    })

    it('10. should claim and withdraw from several auctions as a buyer', async () => {
      // GIVEN a token pair with two closed auctions in wich buyer1 participated
      const auctionIndex = await getAuctionIndex()
      assert.equal(auctionIndex, 2)
      const balanceOfBuyer1 = await dx.balances.call(eth.address, buyer1)
      const notDepositedBuyer1Balance = await eth.balanceOf.call(buyer1)

      // WHEN we claim and withdraw tokens from several auctions as a buyer
      // We have to repeat addresses because we can't pass multilevel array for indices
      // Result is an object with prop '0' and '1'. This happens because they have to be unnamed arrays in the contract
      // Each prop contains claimedAmounts and frtsIssued
      const claimableAmounts = await dx.claimTokensFromSeveralAuctionsAsBuyer.call(
        [eth.address, eth.address], // sellTokens
        [gno.address, gno.address], // buyTokens
        [1, 2], // Auction indices
        buyer1
      )
      // Object.keys reason explained in the comment above in call method
      const claimedAmounts = claimableAmounts[Object.keys(claimableAmounts)[0]]
        .reduce((acc, amount) => {
          return acc.add(amount)
        }, BN_ZERO)
      // check that the token balances have been manipulated correctly
      assert.isTrue(claimedAmounts.gt(BN_ZERO))

      // THEN after claiming and withdrawing balance of deposited tokens should
      // remain the same and balance of not deposited tokens is equal to
      // previous balance plus claimed tokens
      await dx.claimAndWithdrawTokensFromSeveralAuctionsAsBuyer(
        [eth.address, eth.address], [gno.address, gno.address], [1, 2], { from: buyer1 })
      const balanceOfBuyer1After = await dx.balances.call(eth.address, buyer1)
      assert.equal(
        balanceOfBuyer1.toString(),
        balanceOfBuyer1After.toString())
      const notDepositedBuyer1BalanceAfter = await eth.balanceOf.call(buyer1)
      assert.equal(
        notDepositedBuyer1Balance.add(claimedAmounts).toString(),
        notDepositedBuyer1BalanceAfter.toString())
    })
  })
})
