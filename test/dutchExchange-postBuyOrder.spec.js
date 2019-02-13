/* global contract, assert */
/* eslint no-undef: "error" */

const {
  eventWatcher,
  log: utilsLog,
  assertRejects,
  gasLogger,
  varLogger,
  timestamp,
  valMinusFee
} = require('./utils')

const {
  getContracts,
  setupTest,
  postBuyOrder,
  postSellOrder,
  getAuctionIndex,
  waitUntilPriceIsXPercentOfPreviousPrice,
  getClearingTime
} = require('./testFunctions')

// Test VARS
let eth
let gno
let mgn
let dx

let contracts

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    TokenFRT: mgn
  } = contracts)
}

const separateLogs = () => utilsLog('\n    ----------------------------------')
const log = (...args) => utilsLog('\t', ...args)

contract('DutchExchange - postBuyOrder', accounts => {
  const [, buyer1, seller1] = accounts
  // Accounts to fund for faster setupTest
  const setupAccounts = [buyer1, seller1]

  const startBal = {
    startingETH: 100.0.toWei(),
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1008.0.toWei(),
    sellingAmount: 50.0.toWei()
  }

  beforeEach(separateLogs)
  afterEach(() => gasLogger())

  before(async () => {
    // get contracts
    await setupContracts()
    // destructure contracts into upper state

    await setupTest(setupAccounts, contracts, startBal)

    // eventWatcher(dx, 'NewSellOrder')
    // eventWatcher(dx, 'ClearAuction')
    eventWatcher(dx, 'Log')

    const totalMGN = (await mgn.totalSupply.call()).toNumber()
    assert.strictEqual(totalMGN, 0, 'total TUL tokens should be 0')
    // then we know that feeRatio = 1 / 200
    feeRatio = 1 / 200
  })

  after(eventWatcher.stopWatching)

  const getTokenBalance = async (account, token) => dx.balances.call(token.address || token, account)

  const getBuyerBalance = async (account, sellToken, buyToken, auctionIndex) =>
    dx.buyerBalances.call(sellToken.address || sellToken, buyToken.address || buyToken, auctionIndex, account)

  const getBuyVolume = async (sellToken, buyToken) =>
    dx.buyVolumes.call(sellToken.address || sellToken, buyToken.address || buyToken)

  const getChangedAmounts = async (account, sellToken, buyToken, auctionIndex) => {
    const [balance, buyerBalance, buyVolume] = await Promise.all([
      getTokenBalance(account, buyToken),
      getBuyerBalance(account, sellToken, buyToken, auctionIndex),
      getBuyVolume(sellToken, buyToken)
    ])

    log(`
      balance\t\t==\t${balance}
      sellerBalance\t==\t${buyerBalance}
      for auctionIndex ${auctionIndex}
      buyVolume\t==\t${buyVolume}
    `)

    return {
      balance,
      buyerBalance,
      buyVolume
    }
  }

  const assertChangedAmounts = (
    oldAmounts, newAmounts, amount, amountAfterFee,
    buyOrderClosesAuction, outstandingVolumeBought
  ) =>
    Object.keys(newAmounts).forEach(key => {
      const oldVal = oldAmounts[key]
      const newVal = newAmounts[key]

      const incByAmountAfterFee = () => {
        if (!buyOrderClosesAuction) {
          assert.strictEqual(oldVal.add(amountAfterFee).toString(), newVal.toString(), `${key} should be increased by amountAfterFee`)
        } else {
          assert.strictEqual(oldVal.add(outstandingVolumeBought).toString(), newVal.toString(), `${key} should be increased by outstandingVolume`)
        }
      }

      switch (key) {
        case 'balance':
          if (!buyOrderClosesAuction) {
            assert.strictEqual(oldVal.sub(amount).toString(), newVal.toString(), 'balance should be reduced by amount')
          } else {
            assert.strictEqual(oldVal.sub(outstandingVolumeBought).toString(), newVal.toString(), 'balance should be reduced by amount')
          }
          return
        case 'buyerBalance':
          incByAmountAfterFee()
          return
        case 'buyVolume':
          if (!buyOrderClosesAuction) {
            incByAmountAfterFee()
          } else {
            assert.equal(newVal, 0)
          }
          break
        default:
      }
    })

  const getAmountAfterFee = valMinusFee // amount => Math.floor(amount.sub(amount.mul(feeRatio)))

  it('rejects when auction is still in 10 min waiting period', async () => {
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
    const auctionIndex = getAuctionIndex(eth, gno)
    await assertRejects(postBuyOrder(eth, gno, auctionIndex, 1.0.toWei(), buyer1))
  })

  it('balances are correctly changed when auction is running and order is not clearing order', async () => {
    const auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    const amount = 10.0.toWei()
    const oldAmounts = await getChangedAmounts(buyer1, eth, gno, auctionIndex)
    varLogger('balance of buyer', (await dx.balances.call(gno.address, buyer1)).toString())
    await postBuyOrder(eth, gno, auctionIndex, amount, buyer1)
    const newAmounts = await getChangedAmounts(buyer1, eth, gno, auctionIndex)
    const auctionWasClosed = (auctionIndex + 1 === (await getAuctionIndex()))
    // assert right condition
    assert.equal(auctionWasClosed, false)
    // assert right changes
    assertChangedAmounts(oldAmounts, newAmounts, amount, getAmountAfterFee(amount), auctionWasClosed, 0)
  })

  it('balances are correctly changed when auction is running and order IS clearing order && closingPrice is set correctly', async () => {
    const auctionIndex = await getAuctionIndex()
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 0.9)
    const amount = 10.0.toWei()
    const oldAmounts = await getChangedAmounts(buyer1, eth, gno, auctionIndex)
    const sellVolume = await dx.sellVolumesCurrent.call(eth.address, gno.address)
    const buyVolume = await getBuyVolume(eth, gno)
    await postBuyOrder(eth, gno, auctionIndex, amount, buyer1)
    const { num, den } = await dx.getCurrentAuctionPrice.call(eth.address, gno.address, auctionIndex)

    const outstandingVolume = sellVolume.mul(num).div(den).sub(buyVolume)
    varLogger('oustandingVolume', outstandingVolume.toString())
    const newAmounts = await getChangedAmounts(buyer1, eth, gno, auctionIndex)
    const auctionWasClosed = (auctionIndex + 1 === (await getAuctionIndex()))
    // assert right condition
    assert.equal(auctionWasClosed, true)
    // assert right conditions
    assertChangedAmounts(oldAmounts, newAmounts, amount, getAmountAfterFee(amount), auctionWasClosed, outstandingVolume)

    // check also that closing Price is set correctly
    const { num: num2 } = await dx.closingPrices.call(eth.address, gno.address, 1)
    assert.equal(buyVolume.add(outstandingVolume).sub(num2).toNumber(), 0)

    // check that clearingTime was set correctly
    const clearingTime = await getClearingTime(eth.address, gno.address, auctionIndex)
    const now = await timestamp()
    assert.equal(clearingTime, now, 'clearingTime was set')
  })

  it('rejects when auction is not funded', async () => {
    await postSellOrder(eth, gno, 0, 0.01.toWei(), seller1)
    // checking condition:
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    assert.equal(1, auctionStart)
    // checking rejection
    await assertRejects(postBuyOrder(eth, gno, 1, 1.0.toWei(), buyer1))
  })

  it('rejects when auction is already closed: den != 0', async () => {
    await Promise.all([
      postSellOrder(eth, gno, 0, 1.0.toWei(), seller1),
      postSellOrder(gno, eth, 0, 10.0.toWei(), seller1)
    ])
    // checking condition:
    const auctionStart = (await dx.getAuctionStart.call(eth.address, gno.address)).toNumber()
    assert.equal(auctionStart > 1, true)
    // checking conditions:
    const { den } = await dx.closingPrices(eth.address, gno.address, 1)
    assert.isFalse(den.isZero())
    // checking rejection
    await assertRejects(postBuyOrder(eth, gno, 1, 1.0.toWei(), buyer1))
  })

  it('rejects when auction is not latest auction', async () => {
    // checking condition:
    assert.equal(2, await getAuctionIndex(eth, gno))
    // checking rejection
    await assertRejects(postBuyOrder(eth, gno, 1, 1.0.toWei(), buyer1))
  })
})
