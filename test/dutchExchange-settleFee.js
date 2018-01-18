const {
  eventWatcher,
  logger,
  assertRejects,
} = require('./utils')

const { getContracts } = require('./testFunctions')

// Test VARS
let eth
let gno
let tul
let dx
// let inT


let contracts

contract('DutchExchange - calculateFeeRatio', (accounts) => {
  const [master, seller1] = accounts
  const testingAccs = accounts.slice(1, 5)

  const ETHBalance = 10 ** 9

  const GNOBalance = 10 ** 15

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      // DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tul,
      // using internal contract with settleFeePub calling dx.settleFee internally
      InternalTests: dx,
    } = contracts)

    // set up initial balances for accounts and allowance for dx in accounts' names
    await Promise.all(testingAccs.map(acct => Promise.all([
      eth.deposit({ from: acct, value: ETHBalance }),
      eth.approve(dx.address, ETHBalance, { from: acct }),
      gno.transfer(acct, GNOBalance, { from: master }),
      gno.approve(dx.address, GNOBalance, { from: acct }),
    ])))
  })

  after(eventWatcher.stopWatching)

  const getTotalTUL = async () => (await tul.totalTokens.call()).toNumber()

  const getLockedTUL = async account => (await tul.lockedTULBalances.call(account)).toNumber()

  const mintTokens = (account, amount) => tul.mintTokens(account, amount, { from: master })

  const calculateFeeRatio = async account => (await dx.calculateFeeRatioForJS.call(account)).map(n => n.toNumber())

  it('calculateFeeRatio works correctly when TokenTul.totalTokens() == 0', async () => {
    const totalTul = await getTotalTUL()

    assert.strictEqual(totalTul, 0, 'initially no TUL tokens')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.strictEqual(num / den, 0.005, 'feeRatio is 0.5% when total TUL tokens == 0')
  })

  it('calculateFeeRatio works correctly when TokenTul.totalTokens() > 0', async () => {
    await tul.updateMinter(master, { from: master })
    await mintTokens(master, 1000)
    const totalTul = await getTotalTUL()

    assert.strictEqual(totalTul, 1000, 'there are available total TUL tokens')

    const lockedTULBalance = await getLockedTUL(seller1)
    assert.strictEqual(lockedTULBalance, 0, 'seller doesn\'t have TUL balance')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.strictEqual(num / den, 0.005, 'feeRatio is 0.5% when total TUL tokens > 0 but account\'s TUL balance == 0')
  })

  it('calculateFeeRatio works correctly when TokenTul.totalTokens() > 0 and account has 1 % total TUL', async () => {
    const totalTul1 = await getTotalTUL()
    const percent1 = Math.round(totalTul1 / (1 / 0.01 - 1))
    await mintTokens(seller1, percent1)

    assert.isAbove(totalTul1, 0, 'there are available total TUL tokens')

    const totalTul2 = await getTotalTUL()

    const lockedTULBalance = await getLockedTUL(seller1)
    assert.strictEqual(lockedTULBalance, Math.round(totalTul2 * 0.01), 'seller has 1% of total TUL')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.equal((num / den).toFixed(4), 0.0025, 'feeRatio is 0.25% when total TUL tokens > 0 but account\'s TUL balance == 1% total TUL')
  })

  it('calculateFeeRatio works correctly when TokenTul.totalTokens() > 0 and account has >= 10 % total TUL', async () => {
    const totalTul1 = await getTotalTUL()
    const lockedTULBalance1 = await getLockedTUL(seller1)
    const percent10 = Math.ceil((totalTul1 - lockedTULBalance1 / 0.1) / (1 / 0.1 - 1))
    await mintTokens(seller1, percent10)

    assert.isAbove(totalTul1, 0, 'there are available total TUL tokens')

    const totalTul2 = await getTotalTUL()

    const lockedTULBalance2 = await getLockedTUL(seller1)
    assert.strictEqual(lockedTULBalance2, Math.ceil(totalTul2 * 0.1), 'seller has 10% of total TUL')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.equal(num / den, 0, 'feeRatio is 0% when total TUL tokens > 0 but account\'s TUL balance == 10% total TUL')
  })
})

contract('DutchExchange - settleFee', (accounts) => {
  const [master, seller1] = accounts
  const testingAccs = accounts.slice(1, 5)

  const ETHBalance = 10 ** 9

  const GNOBalance = 10 ** 15

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      // DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tul,
      // using internal contract with settleFeePub calling dx.settleFee internally
      InternalTests: dx,
    } = contracts)

    // set up initial balances for accounts and allowance for dx in accounts' names
    await Promise.all(testingAccs.map(acct => Promise.all([
      eth.deposit({ from: acct, value: ETHBalance }),
      eth.approve(dx.address, ETHBalance, { from: acct }),
      gno.transfer(acct, GNOBalance, { from: master }),
      gno.approve(dx.address, GNOBalance, { from: acct }),
    ])))

    await tul.updateMinter(master, { from: master })
  })

  after(eventWatcher.stopWatching)

  /**
   * Internally calls DutchExchange.settleFee
   * @args Array of:
   * @param {address} primaryToken
   * @param {address} secondaryToken
   * @param {uint} auctionIndex
   * @param {address} user
   * @param {uint} amount
   */
  const settleFee = (...args) => dx.settleFeePub(...args)

  settleFee.call = async (...args) => (await dx.settleFeePub.call(...args)).toNumber()

  const getTotalTUL = async () => (await tul.totalTokens.call()).toNumber()

  const getLockedTUL = async account => (await tul.lockedTULBalances.call(account)).toNumber()

  const mintTokens = (account, amount) => tul.mintTokens(account, amount, { from: master })
})
