
/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */


/*
MGN token issuing will not be covered in these tests, as they are covered in the magnolia testing scripts
*/

const bn = require('bignumber.js')
const {
  eventWatcher,
  assertRejects,
  logger,
  gasLogger,
  makeSnapshot,
  revertSnapshot
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

const valMinusFee = amount => amount - (amount / 200)


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

contract('DutchExchange - claimBuyerFunds', (accounts) => {
  const [, seller1, seller2, buyer1, buyer2] = accounts
  const totalSellAmount2ndAuction = 10e18

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
        10e18,
        0,
        2,
        1,
        { from: seller1 },
      )
    })

    after(async () => {
      await revertSnapshot(currentSnapshotId)
      eventWatcher.stopWatching()
    })

    it('1. check for a throw, if auctionIndex is bigger than the latest auctionIndex', async () => {
      const auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      await assertRejects(dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex + 1))
    })

    // FIXME this test is dependent from the previous one
    it(' 2. checks that the return value == 0, if price.num == 0 ', async () => {
      // prepare test by starting and clearing new auction
      let auctionIndex = await getAuctionIndex()
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction, seller2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, auctionIndex, 2 * 10e18, buyer1)
      auctionIndex = await getAuctionIndex()
      await setAndCheckAuctionStarted(eth, gno)
      assert.equal(2, auctionIndex)

      // now claiming should not be possible and return == 0
      await setAndCheckAuctionStarted(eth, gno)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.5)
      const [closingPriceNum] = (await dx.closingPrices.call(gno.address, eth.address, auctionIndex - 1)).map(i => i.toNumber())

      // checking that test is executed correctly
      assert.equal(closingPriceNum, 0)
      logger('here it is', closingPriceNum)
      const [claimedAmount] = (await dx.claimBuyerFunds.call(gno.address, eth.address, buyer1, auctionIndex - 1)).map(i => i.toNumber())

      // checking that right amount is claimed
      assert.equal(claimedAmount, 0)
    })

    // FIXME this test is dependent from the previous ones
    it('4. check right amount of coins is returned by claimBuyerFunds if auction is not closed', async () => {
      const auctionIndex = await getAuctionIndex()

      // prepare test by starting and closing theoretical auction
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)

      await postBuyOrder(gno, eth, auctionIndex, totalSellAmount2ndAuction / 4, buyer2)

      // checking that closingPriceToken.num == 0
      const [closingPriceNumToken] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
      assert.equal(closingPriceNumToken, 0)

      // actual testing at time with previous price
      const [claimedAmount] = (await dx.claimBuyerFunds.call(gno.address, eth.address, buyer2, auctionIndex)).map(i => i.toNumber())
      const [num, den] = await dx.getCurrentAuctionPrice.call(gno.address, eth.address, auctionIndex)
      let sellVolume = (await dx.sellVolumesCurrent.call(gno.address, eth.address))
      let buyVolume = await dx.buyVolumes.call(gno.address, eth.address)
      logger('buyVolume', buyVolume)
      logger('num', num)
      logger('den', den)

      let oustandingVolume = (sellVolume.mul(num).div(den)).sub(buyVolume)
      logger('oustandingVolume', oustandingVolume.toNumber())

      assert.equal((bn(valMinusFee(totalSellAmount2ndAuction)).mul(buyVolume).div(buyVolume.add(oustandingVolume))).toNumber(), claimedAmount)

      // actual testing at time with previous 2/3price
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 2 / 3)
      const [claimedAmount2] = (await dx.claimBuyerFunds.call(gno.address, eth.address, buyer2, auctionIndex)).map(i => i.toNumber())
      const [num2, den2] = await dx.getCurrentAuctionPrice.call(gno.address, eth.address, auctionIndex)
      sellVolume = (await dx.sellVolumesCurrent.call(gno.address, eth.address))
      buyVolume = (await dx.buyVolumes.call(gno.address, eth.address))
      oustandingVolume = (sellVolume.mul(num2).div(den2)).sub(buyVolume)
      logger('oustandingVolume', oustandingVolume)
      logger('buyVolume', buyVolume)
      assert.equal((bn(valMinusFee(totalSellAmount2ndAuction)).mul(buyVolume).div(buyVolume.add(oustandingVolume))).toNumber(), claimedAmount2)
    })

    it(' 3. checks that a non-buyer can not claim any returns', async () => {
      const [claimedAmount] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, 0)).map(i => i.toNumber())
      assert.equal(claimedAmount, 0)
    })
  })

  describe ('Running independent tests', () => {
    beforeEach(async () => {
      currentSnapshotId = await makeSnapshot()
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
    })

    afterEach(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('5. check right amount of coins is returned by claimBuyerFunds if auction is  not closed, but closed theoretical ', async () => {
      // prepare test by starting and clearning new auction

      const auctionIndex = await getAuctionIndex()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer1)


      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)

      // checking that closingPriceToken.num == 0
      const [closingPriceNumToken] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex)).map(i => i.toNumber())
      assert.equal(closingPriceNumToken, 0)

      // actual testing
      const [claimedAmount] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)).map(i => i.toNumber())
      assert.equal(valMinusFee(totalSellAmount2ndAuction), claimedAmount)
    })

    it('6. check that already claimedBuyerfunds are substracted properly', async () => {
      // prepare test by starting and clearning new auction

      const auctionIndex = await getAuctionIndex()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer1)

      // first withdraw
      const [claimedAmount] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)).map(i => i.toNumber())
      const [num, den] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex))
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal((bn(valMinusFee(10e18)).div(num).mul(den)).toNumber(), claimedAmount)

      const [num2, den2] = (await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex))
      logger('num', num2)
      logger('den', den2)

      // second withdraw
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.4)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer1)

      const [claimedAmount2] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)).map(i => i.toNumber())
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal((bn(valMinusFee(10e18)).sub(bn(valMinusFee(10e18)).div(num2).mul(den2))).toNumber(), claimedAmount2)
    })

    it('7. check that extraTokens are distributed correctly', async () => {
      // prepare test by starting and clearning new auction
      let auctionIndex = await getAuctionIndex()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, auctionIndex, 2 * 10e18, buyer1)
      await postSellOrder(eth, gno, 0, 10e18, seller1)

      auctionIndex = await getAuctionIndex()
      assert.equal(auctionIndex, 2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.6)
      const extraTokensAvailable = await dx.extraTokens.call(eth.address, gno.address, 2)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer1)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.6)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer2)

      // Check extra Token balance
      const [claimedAmount] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)).map(i => i.toNumber())
      const [num, den] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex))
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal(((bn(valMinusFee(10e18)).div(num).mul(den)).add(extraTokensAvailable.div(2)))
      .toNumber(), claimedAmount)
    })

    it('8. check that the acutal accounting of balances is done correctly', async () => {
      // prepare test by starting and clearning new auction
      let auctionIndex = await getAuctionIndex()
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(eth, gno, auctionIndex, 2 * 10e18, buyer1)
      await postSellOrder(eth, gno, 0, 10e18, seller1)

      auctionIndex = await getAuctionIndex()
      assert.equal(auctionIndex, 2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1.6)
      const extraTokensAvailable = await dx.extraTokens.call(eth.address, gno.address, 2)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer1)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.6)
      await postBuyOrder(eth, gno, auctionIndex, 10e18, buyer2)
      const balanceOfBuyer1 = await dx.balances.call(eth.address, buyer1)
      const [claimedAmount] = (await dx.claimBuyerFunds.call(eth.address, gno.address, buyer1, auctionIndex)).map(i => i.toNumber())
      const [num, den] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex))
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal(((bn(valMinusFee(10e18)).div(num).mul(den)).add(extraTokensAvailable.div(2)))
      .toNumber(), claimedAmount)

      // check that the token balances have been manipulated correctly
      await dx.claimBuyerFunds(eth.address, gno.address, buyer1, auctionIndex)
      assert.equal((balanceOfBuyer1.add(claimedAmount)).toNumber(), (await dx.balances.call(eth.address, buyer1)).toNumber())
    })
  })
})
