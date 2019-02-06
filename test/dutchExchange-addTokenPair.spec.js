/* global contract, assert, artifacts */
/* eslint no-undef: "error" */

const {
  BN,
  eventWatcher,
  log: utilsLog,
  assertRejects,
  gasLogger,
  timestamp,
  valMinusFee
} = require('./utils')

const { getContracts, setupTest, getClearingTime, getAuctionIndex } = require('./testFunctions')

const TokenGNO = artifacts.require('TokenGNO')

// Test VARS
let eth
let gno, gno2
let mgn
let dx
let oracle

let feeRatio

let contracts, symbols

const separateLogs = () => utilsLog('\n    ----------------------------------')
const log = (...args) => utilsLog('\t', ...args)

contract('DutchExchange - addTokenPair', accounts => {
  const [master, seller1] = accounts

  const startBal = {
    startingETH: 90.0.toWei(),
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1008.0.toWei(),
    sellingAmount: 50.0.toWei()
  }

  let addTokenPairDefaults

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
      PriceOracleInterface: oracle
    } = contracts)

    await setupTest(accounts, contracts, startBal)

    // TODO enable event watchers again
    // eventWatcher(dx, 'NewTokenPair')
    eventWatcher(dx, 'Log')
    eventWatcher(dx, 'LogNumber')

    const totalMgn = (await mgn.totalSupply.call()).toNumber()
    assert.strictEqual(totalMgn, 0, 'total MGN tokens should be 0')
    // then we know that feeRatio = 1 / 200
    feeRatio = 1 / 200

    addTokenPairDefaults = {
      token1: eth.address,
      token2: gno.address,
      token1Funding: new BN('10000000'),
      token2Funding: new BN('1000'),
      initialClosingPriceNum: 2,
      initialClosingPriceDen: 1
    }

    // a new deployed GNO to act as a different token
    gno2 = await TokenGNO.new(10000.0.toWei(), { from: master })
    await Promise.all([
      gno2.transfer(seller1, startBal.startingGNO, { from: master }),
      gno2.approve(dx.address, startBal.startingGNO, { from: seller1 })
    ])
    await dx.deposit(gno2.address, startBal.startingGNO, { from: seller1 })

    symbols = {
      [eth.address]: 'ETH',
      [gno.address]: 'GNO',
      [gno2.address]: 'GNO2'
    }
  })

  const symb = token => symbols[token.address || token]

  after(eventWatcher.stopWatching)

  const getTokenBalance = async (account, token) => {
    const balance = (await dx.balances.call(token.address || token, account))
    log(`
      balance ${symb(token)}\t==\t${balance}
    `)
    return balance
  }

  const getTokenBalances = (account, sellToken, buyToken) => Promise.all([
    getTokenBalance(account, sellToken),
    getTokenBalance(account, buyToken)
  ])

  const assertTokenBalances = (
    [token1Bal, token2Bal],
    balances2,
    token1Funding = addTokenPairDefaults.token1Funding,
    token2Funding = addTokenPairDefaults.token2Funding
  ) => assert.deepEqual(
    balances2.map(b => b.toString()),
    [token1Bal.sub(token1Funding).toString(), token2Bal.sub(token2Funding).toString()],
    'balances should decrease by tokenFunding amount')

  const getAuctionStart = async (sellToken, buyToken) =>
    (await dx.getAuctionStart.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()

  const getSellerBalance = async (account, sellToken, buyToken, auctionIndex) =>
    (await dx.sellerBalances.call(sellToken.address || sellToken, buyToken.address || buyToken, auctionIndex, account))
      .toNumber()

  const getSellVolumeCurrent = async (sellToken, buyToken) =>
    (await dx.sellVolumesCurrent.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()

  const getInitClosingPrice = async (sellToken, buyToken) =>
    dx.closingPrices.call(sellToken.address || sellToken, buyToken.address || buyToken, 0)

  const getAmounts = async (account, sellToken, buyToken) => {
    const [sellerBalance, sellVolumeCurrent] = await Promise.all([
      getSellerBalance(account, sellToken, buyToken, 1),
      getSellVolumeCurrent(sellToken, buyToken)
    ])

    log(`
    ${symb(sellToken)}->${symb(buyToken)}

      sellerBalance\t==\t${sellerBalance}
      sellVolumeCurrent\t==\t${sellVolumeCurrent}
    `)

    return {
      sellerBalance,
      sellVolumeCurrent
    }
  }

  const getAmountsForPair = async (account, sellToken, buyToken) => {
    const [direct, opposite] = await Promise.all([
      getAmounts(account, sellToken, buyToken),
      getAmounts(account, buyToken, sellToken)
    ])

    return { direct, opposite }
  }

  const getAmountAfterFee = amount => Math.floor(amount - Math.floor(amount * feeRatio))

  const assertAmounts = (
    { direct, opposite },
    token1Funding = addTokenPairDefaults.token1Funding,
    token2Funding = addTokenPairDefaults.token2Funding
  ) => {
    const token1FundingAfterFee = getAmountAfterFee(token1Funding)
    const token2FundingAfterFee = getAmountAfterFee(token2Funding)

    Object.keys(direct).forEach(key => {
      assert.strictEqual(direct[key], token1FundingAfterFee, `${key} should be equal to token1Funding`)
      assert.strictEqual(opposite[key], token2FundingAfterFee, `${key} should be equal to token2Funding`)
    })
  }

  const getEventFromTX = ({ logs }, eventName) => {
    const event = logs.find(l => l.event === eventName)
    if (event) return event.args

    return null
  }

  const assertNewTokenPairEvent = (tx, sellToken, buyToken) => {
    assert.propertyVal(
      getEventFromTX(tx, 'NewTokenPair'),
      'sellToken', sellToken.address || sellToken,
      'token pair should be added'
    )
    assert.propertyVal(
      getEventFromTX(tx, 'NewTokenPair'),
      'buyToken', buyToken.address || buyToken,
      'token pair should be added'
    )
  }

  const addTokenPair = (account, options) => {
    options = { ...addTokenPairDefaults, ...options }
    options.token1 = options.token1.address || options.token1
    options.token2 = options.token2.address || options.token2

    const {
      token1,
      token2,
      token1Funding,
      token2Funding,
      initialClosingPriceNum,
      initialClosingPriceDen
    } = options

    log(`tx params:
  ${JSON.stringify(options, null, 8)}
    `)

    return dx.addTokenPair(
      token1.address || token1,
      token2.address || token2,
      token1Funding,
      token2Funding,
      initialClosingPriceNum,
      initialClosingPriceDen,
      { from: account }
    )
  }

  const getFundedValueUSD = async (
    sellToken,
    buyToken,
    token1Funding = addTokenPairDefaults.token1Funding,
    token2Funding = addTokenPairDefaults.token2Funding
  ) => {
    const ETHUSDPrice = await oracle.getUSDETHPrice.call()
    let fundedValueETH

    if (sellToken === eth || sellToken === eth.address) {
      fundedValueETH = token1Funding
    } else if (buyToken === eth || buyToken === eth.address) {
      fundedValueETH = token2Funding
    } else {
      const { num: num1, den: den1 } = await dx.getPriceOfTokenInLastAuction.call(sellToken.address || sellToken)
      const { num: num2, den: den2 } = await dx.getPriceOfTokenInLastAuction.call(buyToken.address || buyToken)

      fundedValueETH = num1.mul(token1Funding).div(den1).add(num2.mul(token2Funding).div(den2))
    }

    const fundedValueUSD = ETHUSDPrice.mul(fundedValueETH)
    log(`
    fundedValueUSD\t==\t${fundedValueUSD}
    `)

    return fundedValueUSD
  }

  const getThresholdNewTokenPair = async () => {
    const thresholdNewTokenPair = await dx.thresholdNewTokenPair.call()
    log(`
    thresholdNewTokenPair ==\t${thresholdNewTokenPair}
    `)

    return thresholdNewTokenPair
  }

  const assertFundingAboveThreshold = async (sellToken, buyToken, token1Funding, token2Funding) => {
    const thresholdNewTokenPair = await getThresholdNewTokenPair()
    const fundedValueUSD = await getFundedValueUSD(sellToken, buyToken, token1Funding, token2Funding)
    assert.isTrue(fundedValueUSD.gt(thresholdNewTokenPair), 'Funded value is not above threshold')
  }

  const assertClosingPrices = async (
    sellToken,
    buyToken,
    initialClosingPriceNum = addTokenPairDefaults.initialClosingPriceNum,
    initialClosingPriceDen = addTokenPairDefaults.initialClosingPriceDen
  ) => {
    const { num: num1, den: den1 } = await getInitClosingPrice(sellToken, buyToken)
    const { num: num2, den: den2 } = await getInitClosingPrice(buyToken, sellToken)

    assert.deepEqual(
      [num1.toNumber(), den1.toNumber()],
      [initialClosingPriceNum, initialClosingPriceDen],
      `closing price for ${symb(sellToken)}->${symb(buyToken)} is correct`)
    assert.deepEqual(
      [num2.toNumber(), den2.toNumber()],
      [initialClosingPriceDen, initialClosingPriceNum],
      `closing price for ${symb(buyToken)}->${symb(sellToken)} is correct`)
  }

  const assertAuctionStart = async (sellToken, buyToken) => {
    const auctionStart = await getAuctionStart(sellToken, buyToken)

    assert.strictEqual(auctionStart - await timestamp(), 6 * 3600, 'auction should start in 6 hours')
  }

  const assertAuctionIndex = async (sellToken, buyToken) => {
    const auctionIndex = await getAuctionIndex(sellToken, buyToken)

    assert.equal(auctionIndex, 1, 'auctionIndex incremented')
  }

  const assertClearingTime = async (sellToken, buyToken) => {
    const clearingTime = await getClearingTime(sellToken, buyToken, 0)
    const now = await timestamp()
    assert.equal(clearingTime, now, 'clearing time for 0th auction set')
  }

  const assertAfterTx = async (account, tx, oldBalances, sellToken, buyToken) => {
    assertNewTokenPairEvent(tx, sellToken, buyToken)
    const amounts = await getAmountsForPair(account, sellToken, buyToken)
    assertAmounts(amounts)
    await assertClosingPrices(sellToken, buyToken)
    await assertTokenBalances(oldBalances, await getTokenBalances(account, sellToken, buyToken))
    await assertAuctionStart(sellToken, buyToken)
    await assertAuctionIndex(sellToken, buyToken)
    await assertClearingTime(sellToken, buyToken)
  }

  it('rejects if both tokens in a pair are the same', async () => {
    log('adding ETH -> ETH token pair')
    await assertRejects(addTokenPair(seller1, { token1: eth, token2: eth }))
    log('tx was rejected')
  })

  it('rejects if initialClosingPriceNum == 0', async () => {
    log('adding ETH -> GNO token pair with initialClosingPriceNum == 0')
    await assertRejects(addTokenPair(seller1, { initialClosingPriceNum: 0 }))
    log('tx was rejected')
  })

  it('rejects if initialClosingPriceDen == 0', async () => {
    log('adding ETH -> GNO token pair with initialClosingPriceDen == 0')
    await assertRejects(addTokenPair(seller1, { initialClosingPriceDen: 0 }))
    log('tx was rejected')
  })

  it('rejects if fundedValueUSD < thresholdNewTokenPair', async () => {
    const thresholdNewTokenPair = await getThresholdNewTokenPair()
    const token1Funding = 0.001.toWei()
    const fundedValueUSD = await getFundedValueUSD(eth, gno, token1Funding)

    assert.isTrue(fundedValueUSD.lt(thresholdNewTokenPair), 'fundedValueUSD < thresholdNewTokenPair')

    log('adding ETH -> GNO token pair with fundedValueUSD < thresholdNewTokenPair')
    await assertRejects(addTokenPair(seller1, { token1Funding }))
    log('tx was rejected')
  })

  it('all amounts and balances are set correctly when adding ETH -> GNO pair', async () => {
    //   await dx.updateExchangeParams(master, oracle.address, 0, 0, { from: master })

    await dx.updateThresholdNewTokenPair(0, { from: master })
    await dx.updateThresholdNewAuction(0, { from: master })

    await assertFundingAboveThreshold(eth, gno)

    const balances1 = await getTokenBalances(seller1, eth, gno)

    log('adding ETH -> GNO token pair')
    const tx = await addTokenPair(seller1)

    await assertAfterTx(seller1, tx, balances1, eth, gno)
  })

  it('rejects when adding an existing pair', async () => {
    log('adding GNO -> ETH token pair')
    await assertRejects(addTokenPair(seller1, { token1: gno, token2: eth }))
    log('tx was rejected')
  })

  it('all amounts and balances are set correctly when adding GNO2 -> ETH pair', async () => {
    await assertFundingAboveThreshold(gno2, eth)
    const balances1 = await getTokenBalances(seller1, gno2, eth)

    log('adding GNO2 -> ETH token pair')
    const tx = await addTokenPair(seller1, { token1: gno2, token2: eth })

    await assertAfterTx(seller1, tx, balances1, gno2, eth)
  })

  it('all amounts and balances are set correctly when adding GNO -> GNO2 pair', async () => {
    await assertFundingAboveThreshold(gno, gno2)
    const balances1 = await getTokenBalances(seller1, gno, gno2)

    log('adding GNO2 -> ETH token pair')
    const tx = await addTokenPair(seller1, { token1: gno, token2: gno2 })

    await assertAfterTx(seller1, tx, balances1, gno, gno2)
  })
})
