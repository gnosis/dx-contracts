const {
  eventWatcher,
  logger,
  log,
  assertRejects,
} = require('./utils')

const { getContracts, setupTest } = require('./testFunctions')

// Test VARS
let eth
let gno
let tul
let owl
let dx
let oracle


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

  it('rejects when account\'s sellToken balance == 0', async () => {
    const ethBalance = await getTokenBalance(seller1, eth)

    assert.strictEqual(ethBalance, 0, 'initially account has no ETH in DX')

    const amount = 100

    assert.isAbove(amount, 0, 'amount should be > 0 so as not to trigger reject')

    await assertRejects(dx.postSellOrder(eth.address, gno.address, 1, amount, { from: seller1 }), 'should reject as resulting amount == 0')
  })

  it('rejects when sellToken amount == 0', async () => {
    await depositETH(seller1, 100)

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
})
