const {
  eventWatcher,
  log: utilsLog,
  assertRejects,
  timestamp,
  gasLogger,
} = require('./utils')

const { getContracts, setupTest, wait } = require('./testFunctions')

// Test VARS
let eth
let gno
let mgn
let dx

let feeRatio


let contracts

const separateLogs = () => utilsLog('\n    ----------------------------------')
const log = (...args) => utilsLog('\t', ...args)

contract('DutchExchange - postSellOrder', (accounts) => {
  const [, seller1] = accounts

  const startBal = {
    startingETH: 0,
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1100.0.toWei(),
    sellingAmount: 50.0.toWei(),
  }

  beforeEach(separateLogs)
  afterEach(gasLogger)

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      EtherToken: eth,
      TokenGNO: gno,
      TokenFRT: mgn,
      DutchExchange: dx,
    } = contracts)

    await setupTest(accounts, contracts, startBal)

    eventWatcher(dx, 'NewSellOrder')
    eventWatcher(dx, 'Log')

    const totalMGN = (await mgn.totalSupply.call()).toNumber()
    assert.strictEqual(totalMGN, 0, 'total TUL tokens should be 0')
    // then we know that feeRatio = 1 / 200
    feeRatio = 1 / 200
  })

  after(eventWatcher.stopWatching)

  const getTokenBalance = async (account, token) => (await dx.balances.call(token.address || token, account)).toNumber()

  const depositETH = async (account, amount) => {
    await eth.deposit({ from: account, value: amount })
    await eth.approve(dx.address, amount, { from: account })
    return dx.deposit(eth.address, amount, { from: account })
  }

  const getAuctionIndex = async (sellToken, buyToken) =>
    (await dx.getAuctionIndex.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()

  const getAuctionStart = async (sellToken, buyToken) =>
    (await dx.getAuctionStart.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()

  const getSellerBalance = async (account, sellToken, buyToken, auctionIndex) =>
    (await dx.sellerBalances.call(sellToken.address || sellToken, buyToken.address || buyToken, auctionIndex, account))
      .toNumber()

  const getSellVolumeCurrent = async (sellToken, buyToken) =>
    (await dx.sellVolumesCurrent.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()

  const getSellVolumeNext = async (sellToken, buyToken) =>
    (await dx.sellVolumesNext.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()

  const getChangedAmounts = async (account, sellToken, buyToken, auctionIndex) => {
    const [balance, sellerBalance, sellVolumeCurrent, sellVolumeNext] = await Promise.all([
      getTokenBalance(account, sellToken),
      getSellerBalance(account, sellToken, buyToken, auctionIndex),
      getSellVolumeCurrent(sellToken, buyToken),
      getSellVolumeNext(sellToken, buyToken),
    ])

    log(`
      balance\t\t==\t${balance}
      sellerBalance\t==\t${sellerBalance}
      
      for auctionIndex ${auctionIndex}
      sellVolumeCurrent\t==\t${sellVolumeCurrent}
      sellVolumeNext\t==\t${sellVolumeNext}
    `)

    return {
      balance,
      sellerBalance,
      sellVolumeCurrent,
      sellVolumeNext,
    }
  }

  const assertChangedAmounts = (oldAmounts, newAmounts, amount, amountAfterFee, postedToCurrentAuction) =>
    Object.keys(newAmounts).forEach((key) => {
      const oldVal = oldAmounts[key]
      const newVal = newAmounts[key]

      const incByAmountAfterFee = () => assert.strictEqual(oldVal + amountAfterFee, newVal, `${key} should be increased by amountAfterFee`)
      const remainTheSame = () => assert.strictEqual(oldVal, newVal, `${key} should remain the same`)

      switch (key) {
        case 'balance':
          assert.strictEqual(oldVal - amount, newVal, 'balance should be reduced by amount')
          return
        case 'sellerBalance':
          incByAmountAfterFee()
          return
        case 'sellVolumeCurrent':
          if (postedToCurrentAuction) incByAmountAfterFee()
          else remainTheSame()
          return
        case 'sellVolumeNext':
          if (!postedToCurrentAuction) incByAmountAfterFee()
          else remainTheSame()
          break
        default:
      }
    })

  const getAmountAfterFee = amount => Math.floor(amount - Math.floor(amount * feeRatio))

  const getEventFromTX = ({ logs }, eventName) => {
    const event = logs.find(l => l.event === eventName)
    if (event) return event.args.auctionIndex.toNumber()

    return null
  }

  it('rejects when account\'s sellToken balance == 0', async () => {
    const ethBalance = await getTokenBalance(seller1, eth)
    log(`balance == ${ethBalance}`)

    assert.strictEqual(ethBalance, 0, 'initially account has no ETH in DX')

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    log(`posting sell order for ${amount}`)
    await assertRejects(dx.postSellOrder(eth.address, gno.address, 1, amount, { from: seller1 }), 'should reject as resulting amount == 0')
    log('tx was rejected')
  })

  it('rejects when sellToken amount == 0', async () => {
    // deposit 20 ETH into DX
    const eth20 = 20 * (10 ** 18)
    await depositETH(seller1, eth20)

    const ethBalance = await getTokenBalance(seller1, eth)

    assert.isAbove(ethBalance, 0, 'account should have some ETH in DX')

    const amount = 0

    assert.strictEqual(amount, 0, 'amount should be 0')

    log(`posting sell order for ${amount}`)
    await assertRejects(dx.postSellOrder(eth.address, gno.address, 1, amount, { from: seller1 }), 'should reject as resulting amount == 0')
    log('tx was rejected')
  })

  it('rejects when latestAuctionIndex == 0, i.e. no TokenPair was added', async () => {
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 0, 'action hasn\'t run yet')

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')
    log(`posting sell order for ${amount} to a not yet added token pair`)
    await assertRejects(dx.postSellOrder(eth.address, gno.address, latestAuctionIndex, amount, { from: seller1 }), 'should reject as latestAuctionIndex == 0')
    log('tx was rejected')
  })

  it('rejects when auction isn\'t started and order is posted not to that auction', async () => {
    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10.0.toWei(),
      0,
      2,
      1,
      { from: seller1 },
    )
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 1, 'action index > 0')

    const auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, timestamp(), 'auction isn\'t yet running')
    log(`auction #${latestAuctionIndex} isn't yet running`)

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    const auctionIndex = latestAuctionIndex + 1
    assert(auctionIndex !== 0 && auctionIndex !== latestAuctionIndex, 'auctionIndex is nether 0 nor latestAuctionIndex')

    log(`posting sell order for ${amount} to auction #${auctionIndex}(next)`)
    await assertRejects(dx.postSellOrder(eth.address, gno.address, auctionIndex, amount, { from: seller1 }), 'should reject as auctionIndex != latestAuctionIndex')
    log('tx was rejected')
  })

  it('balances are correctly changed when auction isn\'t running and order is posted to that auction', async () => {
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 1, 'action index > 0')

    const auctionStart = await getAuctionStart(eth, gno)
    const postedToCurrentAuction = timestamp() < auctionStart || auctionStart === 1
    assert.isAbove(auctionStart, timestamp(), 'auction isn\'t yet running')
    log(`auction #${latestAuctionIndex} isn't yet running`)

    const amount = 10000

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    const amountAfterFee = getAmountAfterFee(amount)
    assert.isAbove(amountAfterFee, 0, 'amountAfterFee should be > 0 to make a difference')

    const auctionIndex = latestAuctionIndex
    assert.strictEqual(auctionIndex, latestAuctionIndex, 'auctionIndex is latestAuctionIndex')

    const oldAmounts = await getChangedAmounts(seller1, eth, gno, latestAuctionIndex)

    log(`posting sell order for ${amount} (after fee ${amountAfterFee}) to auction #${auctionIndex}(current)`)
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, amount, { from: seller1 })

    const newAmounts = await getChangedAmounts(seller1, eth, gno, latestAuctionIndex)
    assertChangedAmounts(oldAmounts, newAmounts, amount, amountAfterFee, postedToCurrentAuction)
  })

  it('order with auctionIndex == 0 when auction isn\'t running is redirected to the correct index and posted to that auction ', async () => {
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 1, 'action index > 0')

    const auctionStart = await getAuctionStart(eth, gno)
    const postedToCurrentAuction = timestamp() < auctionStart || auctionStart === 1
    assert.isAbove(auctionStart, timestamp(), 'auction isn\'t yet running')
    log(`auction #${latestAuctionIndex} isn't yet running`)

    const amount = 10000

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    const amountAfterFee = getAmountAfterFee(amount)
    assert.isAbove(amountAfterFee, 0, 'amountAfterFee should be > 0 to make a difference')

    const auctionIndex = 0
    assert.notStrictEqual(auctionIndex, latestAuctionIndex, 'auctionIndex isn\'t the same as latestAuctionIndex')

    const oldAmounts = await getChangedAmounts(seller1, eth, gno, latestAuctionIndex)

    log(`posting sell order for ${amount} (after fee ${amountAfterFee}) to auction #${auctionIndex}(redirect-to-current)`)
    const tx = await dx.postSellOrder(eth.address, gno.address, auctionIndex, amount, { from: seller1 })
    assert.strictEqual(getEventFromTX(tx, 'NewSellOrder'), latestAuctionIndex, 'tx should be redirected to latestAuctionIndex')

    const newAmounts = await getChangedAmounts(seller1, eth, gno, latestAuctionIndex)
    assertChangedAmounts(oldAmounts, newAmounts, amount, amountAfterFee, postedToCurrentAuction)
  })

  it('rejects when auction is running and order is posted not to the next auction', async () => {
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 1, 'action index > 0')

    let auctionStart = await getAuctionStart(eth, gno)
    assert.isAbove(auctionStart, timestamp(), 'auction isn\'t yet running')

    await wait(await getAuctionStart(eth, gno) - timestamp())

    auctionStart = await getAuctionStart(eth, gno)
    assert.isAtLeast(timestamp(), auctionStart, 'auction is running')
    log(`auction #${latestAuctionIndex} is running`)

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    const auctionIndex = latestAuctionIndex
    assert(auctionIndex !== 0 && auctionIndex !== latestAuctionIndex + 1, 'auctionIndex is nether 0 nor latestAuctionIndex + 1')

    log(`posting sell order for ${amount} to auction #${auctionIndex}(current)`)
    await assertRejects(dx.postSellOrder(eth.address, gno.address, auctionIndex, amount, { from: seller1 }), 'should reject as auctionIndex != latestAuctionIndex')
    log('tx was rejected')
  })

  it('balances are correctly changed when auction is running and order is posted to the next auction', async () => {
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 1, 'action index > 0')

    const auctionStart = await getAuctionStart(eth, gno)
    const postedToCurrentAuction = timestamp() < auctionStart || auctionStart === 1
    assert.isAtLeast(timestamp(), auctionStart, 'auction is running')
    log(`auction #${latestAuctionIndex} is running`)

    const amount = 10000

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    const amountAfterFee = getAmountAfterFee(amount)
    assert.isAbove(amountAfterFee, 0, 'amountAfterFee should be > 0 to make a difference')

    const auctionIndex = latestAuctionIndex + 1
    assert.strictEqual(auctionIndex, latestAuctionIndex + 1, 'auctionIndex is next auction\'s index')

    const oldAmounts = await getChangedAmounts(seller1, eth, gno, auctionIndex)

    log(`posting sell order for ${amount} (after fee ${amountAfterFee}) to auction #${auctionIndex}(next)`)
    await dx.postSellOrder(eth.address, gno.address, auctionIndex, amount, { from: seller1 })

    const newAmounts = await getChangedAmounts(seller1, eth, gno, auctionIndex)
    assertChangedAmounts(oldAmounts, newAmounts, amount, amountAfterFee, postedToCurrentAuction)
  })

  it('order with auctionIndex == 0 when auction is running is redirected to the correct index and posted to that auction ', async () => {
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 1, 'action index > 0')

    const auctionStart = await getAuctionStart(eth, gno)
    const postedToCurrentAuction = timestamp() < auctionStart || auctionStart === 1
    assert.isAtLeast(timestamp(), auctionStart, 'auction is running')
    log(`auction #${latestAuctionIndex} is running`)

    const amount = 10000

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    const amountAfterFee = getAmountAfterFee(amount)
    assert.isAbove(amountAfterFee, 0, 'amountAfterFee should be > 0 to make a difference')

    const auctionIndex = 0
    assert.notStrictEqual(auctionIndex, latestAuctionIndex + 1, 'auctionIndex isn\'t latestAuctionIndex + 1')

    const oldAmounts = await getChangedAmounts(seller1, eth, gno, latestAuctionIndex + 1)

    log(`posting sell order for ${amount} (after fee ${amountAfterFee}) to auction #${auctionIndex}(redirect-to-next)`)
    const tx = await dx.postSellOrder(eth.address, gno.address, auctionIndex, amount, { from: seller1 })
    assert.strictEqual(getEventFromTX(tx, 'NewSellOrder'), latestAuctionIndex + 1, 'tx should be redirected to latestAuctionIndex + 1')

    const newAmounts = await getChangedAmounts(seller1, eth, gno, latestAuctionIndex + 1)
    assertChangedAmounts(oldAmounts, newAmounts, amount, amountAfterFee, postedToCurrentAuction)
  })
})
