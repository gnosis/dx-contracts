/* Fee Reduction Token issuing is tested seperately in dutchExchange-MGN.js */

const {
  eventWatcher,
  assertRejects,
  enableContractFlag,
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
  const [, seller1, seller2, buyer1, buyer2] = accounts
  const totalSellAmount2ndAuction = 10e18
  const totalBuyAmount = 2 * 10e18
  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)

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

  it(' 2. check for a throw, if seller contribution ==0', async () => {
    // prepare by clearning auction
    let auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer1)
    auctionIndex = await getAuctionIndex()
    await setAndCheckAuctionStarted(eth, gno)
    assert.equal(2, auctionIndex)
    // check condition
    assert.equal((await dx.sellerBalances.call(eth.address, gno.address, 1, seller2)).toNumber(), 0)
    // now claiming should not be possible and return == 0
    await assertRejects(dx.claimSellerFunds(eth.address, gno.address, seller2, 1))
  })
  it(' 3. check for the correct return value', async () => {
    const auctionIndex = await getAuctionIndex()
    const [claimedAmount] = (await dx.claimSellerFunds.call(eth.address, gno.address, seller1, auctionIndex - 1)).map(i => i.toNumber())
    const [closingPriceNum] = (await dx.closingPrices.call(eth.address, gno.address, auctionIndex - 1)).map(i => i.toNumber())
    assert.equal(claimedAmount, closingPriceNum)
  })

  describe('4. Test claim after selling', () => {
    let currentSnapshotId
    beforeEach(async () => {
      currentSnapshotId = await makeSnapshot()
    })

    afterEach(async () => {
      await revertSnapshot(currentSnapshotId)
    })

    it('4.1. It should claim seller funds in an auction with 2 sellers', async () => {
      const auctionIndex = await getAuctionIndex()

      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)

      // closing new auction
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)

      // withdraw and check the balance change
      const seller1BalanceBefore = await dx.balances.call(eth.address, seller1)
      const seller2BalanceBefore = await dx.balances.call(eth.address, seller2)
      await dx.claimSellerFunds(gno.address, eth.address, seller2, auctionIndex)
      await dx.claimSellerFunds(gno.address, eth.address, seller1, auctionIndex)
      const seller1BalanceAfter = await dx.balances.call(eth.address, seller1)
      const seller2BalanceAfter = await dx.balances.call(eth.address, seller2)
      const [closingPriceNum] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
      assert.equal(seller1BalanceBefore.add(closingPriceNum.mul(3).div(5)).toNumber(), seller1BalanceAfter.toNumber())
      assert.equal(seller2BalanceBefore.add(closingPriceNum.mul(2).div(5)).toNumber(), seller2BalanceAfter.toNumber())

      // check that the sellerBalances is set to 0
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
    })

    it('4.2. It should claim and withdraw seller funds in an auction with 2 sellers', async () => {
      const auctionIndex = await getAuctionIndex()
      // starting new auction with two sellers
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)

      // closing new auction
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)

      // withdraw and check the balance change
      const [claimableAmtS1] = (await dx.claimSellerFunds.call(gno.address, eth.address, seller1, auctionIndex)).map(s => s.toNumber())
      const [claimableAmtS2] = (await dx.claimSellerFunds.call(gno.address, eth.address, seller2, auctionIndex)).map(s => s.toNumber())
      const seller1ETHBal = (await dx.balances.call(eth.address, seller1)).toNumber()
      const seller2ETHBal = (await dx.balances.call(eth.address, seller2)).toNumber()

      // claim claimable tokens and withdraw at same time
      await dx.claimAndWithdraw(gno.address, eth.address, seller2, auctionIndex, 10000.0.toWei(), { from: seller2 })
      await dx.claimAndWithdraw(gno.address, eth.address, seller1, auctionIndex, 10000.0.toWei(), { from: seller1 })

      const seller1ETHBalAfter = (await eth.balanceOf.call(seller1)).toNumber()
      const seller2ETHBalAfter = (await eth.balanceOf.call(seller2)).toNumber()

      // check that the sellerBalances is set to 0
      // assert that balance in DX of ETH + ClaimedAndWithdraw-n amount = correct amount
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
      assert.equal(seller1ETHBalAfter, seller1ETHBal + claimableAmtS1)
      assert.equal(seller2ETHBalAfter, seller2ETHBal + claimableAmtS2)
    })

    it.only('5.1. It should claim seller funds in an auction with 2 sellers', async () => {
      const auctionIndex = await getAuctionIndex()

      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)

      // closing new auction
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)
      await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer2)


      await postSellOrder(gno, eth, 0, 5e18, seller1)
      await postSellOrder(gno, eth, 0, 5e18, seller2)
      const auctionIndex2 = await getAuctionIndex()
      assert.equal(auctionIndex2, 2)
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
      const [closingPrice1Num] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex)
      const [closingPrice2Num] = await dx.closingPrices.call(gno.address, eth.address, auctionIndex + 1)
      const seller1BalanceCalc = seller1BalanceBefore.add(closingPrice1Num.mul(3).div(5))
        .add(closingPrice2Num.mul(1).div(2))
      const seller2BalanceCalc = seller2BalanceBefore.add(closingPrice1Num.mul(2).div(5))
        .add(closingPrice2Num.mul(1).div(2))
      assert.equal(seller1BalanceCalc.toNumber(), seller1BalanceAfter.toNumber())
      assert.equal(seller2BalanceCalc.toNumber(), seller2BalanceAfter.toNumber())

      // check that the sellerBalances is set to 0
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
    })

    it.only('5.2. It should claim and withdraw seller funds in an auction with 2 sellers', async () => {
      const auctionIndex = await getAuctionIndex()
      // starting new auction with two sellers
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction / 5, seller2)
      await postSellOrder(gno, eth, 0, totalSellAmount2ndAuction * 3 / 5, seller1)

      // closing new auction
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex, totalBuyAmount, buyer2)
      await postBuyOrder(eth, gno, auctionIndex, totalBuyAmount, buyer2)

      await postSellOrder(gno, eth, 0, 5e18, seller1)
      await postSellOrder(gno, eth, 0, 5e18, seller2)
      const auctionIndex2 = await getAuctionIndex()
      assert.equal(auctionIndex2, 2)
      await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
      await postBuyOrder(gno, eth, auctionIndex + 1, totalBuyAmount, buyer1)

      // withdraw and check the balance change
      const [claimableAmtS1] = (await dx.claimTokensFromSeveralAuctionsAsSeller.call(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller1))
        .map(result => {
          return result.map(value => value.toNumber())
        })
      const [claimableAmtS2] = (await dx.claimTokensFromSeveralAuctionsAsSeller.call(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], seller2))
        .map(result => {
          return result.map(value => value.toNumber())
        })
      const claimedAmountsS1 = claimableAmtS1.reduce((acc, amount) => {
        return acc + amount
      }, 0)
      const claimedAmountsS2 = claimableAmtS2.reduce((acc, amount) => {
        return acc + amount
      }, 0)
      const seller1ETHBal = (await dx.balances.call(eth.address, seller1)).toNumber()
      const seller2ETHBal = (await dx.balances.call(eth.address, seller2)).toNumber()
      // Not deposited seller balances
      const seller1NotDepositedETHBal = (await eth.balanceOf.call(seller1)).toNumber()
      const seller2NotDepositedETHBal = (await eth.balanceOf.call(seller2)).toNumber()

      // claim claimable tokens and withdraw at same time
      await dx.claimAndWithdrawTokensFromSeveralAuctionsAsSeller(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], { from: seller1 })
      await dx.claimAndWithdrawTokensFromSeveralAuctionsAsSeller(
        [gno.address, gno.address], [eth.address, eth.address], [auctionIndex, auctionIndex + 1], { from: seller2 })

      // check that the sellerBalances is set to 0
      // assert that balance in DX of ETH + ClaimedAndWithdraw-n amount = correct amount
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
      assert.equal((await dx.sellerBalances.call(gno.address, eth.address, auctionIndex, seller1)).toNumber(), 0)
      assert.equal(seller1NotDepositedETHBal + claimedAmountsS1, (await eth.balanceOf.call(seller1)).toNumber())
      assert.equal(seller2NotDepositedETHBal + claimedAmountsS2, (await eth.balanceOf.call(seller2)).toNumber())
      //assert that claimed and withdrawed the amount (same deposited in DX)
      assert.equal(seller1ETHBal, (await dx.balances.call(eth.address, seller1)).toNumber())
      assert.equal(seller2ETHBal, (await dx.balances.call(eth.address, seller2)).toNumber())
    })
  })
})
