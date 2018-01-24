const {
  eventWatcher,
  logger,
  log,
  assertRejects,
  timestamp,
} = require('./utils')

const { getContracts, setupTest } = require('./testFunctions')

// Test VARS
let eth
let gno
let tul
let owl
let dx
let oracle

let feeRatio


let contracts

const separateLogs = () => log('\n    ----------------------------------')

contract('DutchExchange - postSellOrder', (accounts) => {
  const [master, seller1] = accounts

  const startBal = {
    startingETH: 0,
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1008.0.toWei(),
    sellingAmount: 50.0.toWei(),
  }

  beforeEach(separateLogs)

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      // DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tul,
      TokenOWL: owl,
      // using internal contract with settleFeePub calling dx.settleFee internally
      DutchExchange: dx,
      PriceOracleInterface: oracle,
    } = contracts)

    await setupTest(accounts, contracts, startBal)

    // add tokenPair ETH GNO
    // await dx.addTokenPair(
    //   eth.address,
    //   gno.address,
    //   10 * (10 ** 18),
    //   0,
    //   2,
    //   1,
    //   { from: seller1 },
    // )

    // await tul.updateMinter(master, { from: master })
    logger('PRICE ORACLE', await oracle.getUSDETHPrice.call())

    const [sNum, sDen] = await dx.getPriceOracleForJS.call(eth.address)
    logger('ST PRICE', `${sNum}/${sDen} == ${sNum / sDen}`)
    const [bNum, bDen] = await dx.getPriceOracleForJS.call(gno.address)
    logger('BT PRICE', `${bNum}/${bDen} == ${bNum / bDen}`)

    eventWatcher(dx, 'NewSellOrder')
    eventWatcher(dx, 'Log')

    const totalTul = (await tul.totalTokens()).toNumber()
    assert.strictEqual(totalTul, 0, 'total TUL tokens should be 0')
    // then we now that feeRatio = 1 / 200
    feeRatio = 1 / 200
  })

  after(eventWatcher.stopWatching)

  const getTokenBalance = async (account, token) => {
    return (await dx.balances.call(token.address || token, account)).toNumber()
  }

  const depositETH = async (account, amount) => {
    await eth.deposit({ from: account, value: amount })
    await eth.approve(dx.address, amount, { from: account })
    return dx.deposit(eth.address, amount, { from: account })
  }

  const getAuctionIndex = async (sellToken, buyToken) => {
    return (await dx.getAuctionIndex.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()
  }

  const getAuctionStart = async (sellToken, buyToken) => {
    return (await dx.getAuctionStart.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()
  }

  const getSellerBalance = async (account, sellToken, buyToken, auctionIndex) => {
    return (await dx.sellerBalances
      .call(sellToken.address || sellToken, buyToken.address || buyToken, auctionIndex, account)
    ).toNumber()
  }

  const getSellVolumeCurrent = async (sellToken, buyToken) => {
    return (await dx.sellVolumesCurrent.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()
  }

  const getSellVolumeNext = async (sellToken, buyToken) => {
    return (await dx.sellVolumesNext.call(sellToken.address || sellToken, buyToken.address || buyToken)).toNumber()
  }

  const getChangedAmounts = async (account, sellToken, buyToken, auctionIndex) => {
    const [balance, sellerBalance, sellVolumeCurrent, sellVolumeNext] = await Promise.all([
      getTokenBalance(account, sellToken),
      getSellerBalance(account, sellToken, buyToken, auctionIndex),
      getSellVolumeCurrent(sellToken, buyToken),
      getSellVolumeNext(sellToken, buyToken),
    ])

    return {
      balance,
      sellerBalance,
      sellVolumeCurrent,
      sellVolumeNext,
    }
  }

  const assertChangedAmounts = async (oldAmounts, newAmounts, amount, amountAfterFee, postedToCurrentAuction) =>
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
  it('rejects when account\'s sellToken balance == 0', async () => {
    const ethBalance = await getTokenBalance(seller1, eth)

    assert.strictEqual(ethBalance, 0, 'initially account has no ETH in DX')

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    await assertRejects(dx.postSellOrder(eth.address, gno.address, 1, amount, { from: seller1 }), 'should reject as resulting amount == 0')
  })

  it('rejects when sellToken amount == 0', async () => {
    await depositETH(seller1, 50.0.toWei())

    const ethBalance = await getTokenBalance(seller1, eth)

    assert.isAbove(ethBalance, 0, 'account should have some ETH in DX')

    const amount = 0

    assert.strictEqual(amount, 0, 'amount should be 0')

    await assertRejects(dx.postSellOrder(eth.address, gno.address, 1, amount, { from: seller1 }), 'should reject as resulting amount == 0')
  })

  it('rejects when latestAuctionIndex == 0, i.e. no TokenPair was added', async () => {
    const latestAuctionIndex = await getAuctionIndex(eth, gno)

    assert.strictEqual(latestAuctionIndex, 0, 'action hasn\'t run yet')

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    await assertRejects(dx.postSellOrder(eth.address, gno.address, latestAuctionIndex, amount, { from: seller1 }), 'should reject as latestAuctionIndex == 0')
  })

  it('rejects when auction isn\'t started and order is posted not to the next auction', async () => {
    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 * (10 ** 18),
      0,
      2,
      1,
      { from: seller1 },
    )
    const latestAuctionIndex = await getAuctionIndex(eth, gno)
    console.log('latestAuctionIndex', latestAuctionIndex)

    assert.strictEqual(latestAuctionIndex, 1, 'action index > 0')

    const auctionStart = await getAuctionStart(eth, gno)
    console.log('auctionStart', auctionStart)
    assert.isAbove(auctionStart, timestamp(), 'auction isn\'t yet running')

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    const auctionIndex = latestAuctionIndex + 1
    assert(auctionIndex !== 0 && auctionIndex !== latestAuctionIndex, 'auctionIndex is nether 0 nor latestAuctionIndex')

    await assertRejects(dx.postSellOrder(eth.address, gno.address, latestAuctionIndex + 1, amount, { from: seller1 }), 'should reject as auctionIndex != latestAuctionIndex')
  })
})
