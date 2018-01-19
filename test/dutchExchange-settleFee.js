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

const getHelperFunctions = (master) => {
  const getTotalTUL = async () => (await tul.totalTokens.call()).toNumber()

  const getLockedTUL = async account => (await tul.lockedTULBalances.call(account)).toNumber()

  const unlockTUL = (account, amount) => tul.unlockTokens(amount, { from: account })

  const mintTokens = (account, amount) => tul.mintTokens(account, amount, { from: master })

  const calculateFeeRatio = async account => (await dx.calculateFeeRatioForJS.call(account)).map(n => n.toNumber())

  const getHowManyToAdd = (totalTul, lockedTULBalance, percent) =>
    Math.round((totalTul - (lockedTULBalance / percent)) / ((1 / percent) - 1))

  // mint TUL to make account have a given percent of total TUL
  const mintPercent = async (account, percent) => {
    const totalTul = await getTotalTUL()
    const lockedTULBalance = await getLockedTUL(account)
    // calculate how much is left to reach the given percent
    let toMint = getHowManyToAdd(totalTul, lockedTULBalance, percent)

    // if given percent < current percent
    if (toMint < 0) {
      // need to add to total TUL
      // mint for master
      account = master
      toMint = (lockedTULBalance / percent) - totalTul
    }
    return mintTokens(account, toMint)
  }

  return {
    getTotalTUL,
    getLockedTUL,
    unlockTUL,
    mintTokens,
    calculateFeeRatio,
    getHowManyToAdd,
    mintPercent,
  }
}

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

  const {
    getTotalTUL,
    getLockedTUL,
    mintTokens,
    calculateFeeRatio,
    mintPercent,
  } = getHelperFunctions(master)

  // const getTotalTUL = async () => (await tul.totalTokens.call()).toNumber()

  // const getLockedTUL = async account => (await tul.lockedTULBalances.call(account)).toNumber()

  // const mintTokens = (account, amount) => tul.mintTokens(account, amount, { from: master })

  // const calculateFeeRatio = async account => (await dx.calculateFeeRatioForJS.call(account)).map(n => n.toNumber())

  // const getHowManyToAdd = (totalTul, lockedTULBalance, percent) =>
  //   Math.round((totalTul - (lockedTULBalance / percent)) / ((1 / percent) - 1))

  // // mint TUL to make account have a given percent of total TUL
  // const mintPercent = async (account, percent) => {
  //   const totalTul = await getTotalTUL()
  //   const lockedTULBalance = await getLockedTUL(seller1)
  //   // calculate how much is left to reach the given percent
  //   let toMint = getHowManyToAdd(totalTul, lockedTULBalance, percent)

  //   // if given percent < current percent
  //   if (toMint < 0) {
  //     // need to add to total TUL
  //     // mint for master
  //     account = master
  //     toMint = (lockedTULBalance / percent) - totalTul
  //   }
  //   return mintTokens(account, toMint)
  // }

  it('feeRatio == 0.5% when total TUL == 0', async () => {
    const totalTul = await getTotalTUL()

    assert.strictEqual(totalTul, 0, 'initially no TUL tokens')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.strictEqual(num / den, 0.005, 'feeRatio is 0.5% when total TUL tokens == 0')
  })

  it('feeRatio == 0.5% when total TUL > 0 and account has 0 TUL', async () => {
    await tul.updateMinter(master, { from: master })
    await mintTokens(master, 1000)
    const totalTul = await getTotalTUL()

    assert.strictEqual(totalTul, 1000, 'there are available total TUL tokens')

    const lockedTULBalance = await getLockedTUL(seller1)
    assert.strictEqual(lockedTULBalance, 0, 'seller doesn\'t have TUL balance')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.strictEqual(num / den, 0.005, 'feeRatio is 0.5% when total TUL tokens > 0 but account\'s TUL balance == 0')
  })

  it('feeRatio == 0.25% when account has 1% of total TUL', async () => {
    await mintPercent(seller1, 0.01)

    const totalTul2 = await getTotalTUL()
    assert.isAbove(totalTul2, 0, 'there are available total TUL tokens')

    const lockedTULBalance = await getLockedTUL(seller1)
    assert.strictEqual(lockedTULBalance, Math.round(totalTul2 * 0.01), 'seller has 1% of total TUL')

    const [num, den] = await calculateFeeRatio(seller1)
    // round feeRatio a bit
    assert.equal((num / den).toFixed(4), 0.0025, 'feeRatio is 0.25% when total TUL tokens > 0 but account\'s TUL balance == 1% total TUL')
  })

  it('feeRatio == 0% when account has >= 10% of total TUL', async () => {
    await mintPercent(seller1, 0.11)

    const totalTul2 = await getTotalTUL()
    assert.isAbove(totalTul2, 0, 'there are available total TUL tokens')

    const lockedTULBalance2 = await getLockedTUL(seller1)
    assert.isAtLeast(lockedTULBalance2, Math.round(totalTul2 * 0.1), 'seller has >= 10% of total TUL')

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

  it('amountAfterFee == amount when fee == 0', async () => {
    const totalTul1 = await getTotalTUL()
    const lockedTULBalance1 = await getLockedTUL(seller1)
    const percent10 = Math.ceil((totalTul1 - lockedTULBalance1 / 0.1) / (1 / 0.1 - 1))
    await mintTokens(seller1, percent10)

    const amount = 100

    const amountAfterFee = await settleFee.call(eth.address, gno.address, 1, seller1, amount)
    assert.strictEqual(amountAfterFee, amount, 'amount should not change when fee == 0')
  })
})
