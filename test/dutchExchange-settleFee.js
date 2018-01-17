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

  it('calculateFeeRatio works correctly when TokenTul.totalTokens() == 0', async () => {
    const totalTul = (await tul.totalTokens.call()).toNumber()

    assert.strictEqual(totalTul, 0, 'initially no TUL tokens')

    const [num, den] = (await dx.calculateFeeRatioForJS.call(seller1)).map(n => n.toNumber())
    assert.strictEqual(num / den, 0.005, 'feeRatio is 0.5% when total TUL tokens == 0')
  })
})
