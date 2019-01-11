const {
  log: utilsLog,
  gasLogger
} = require('./utils')

const { getContracts } = require('./testFunctions')

const BadGNO = artifacts.require('BadGNO')

// Test VARS
let dx, badGNO
let contracts

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

  beforeEach(separateLogs)
  afterEach(gasLogger)

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx
    } = contracts)

    badGNO = await BadGNO.new(1e22, { from: master })
    await Promise.all([
      badGNO.transfer(seller1, startBal.startingGNO, { from: master }),
      badGNO.approve(dx.address, startBal.startingGNO, { from: seller1 })
    ])
  })

  it('deposits bad ERC20 tokens', async () => {
    log('Depositing Bad GNO')
    const tx = await dx.deposit(badGNO.address, startBal.startingGNO, { from: seller1 })
    log('tx: ', JSON.stringify(tx.logs, null, 2))
    log('Succeeded Depositing Bad GNO')
    log('startBal.startingGNO: ', startBal.startingGNO)

    const deposited = await dx.balances(badGNO.address, seller1)
    log('deposited: ', deposited.toString())

    assert(deposited.eq(startBal.startingGNO), 'deposited amount was exactly equal startingGNO')
  })

  it('withdraws bad ERC20 tokens', async () => {
    log('Withdrawing Bad GNO')
    const tx = await dx.withdraw(badGNO.address, startBal.startingGNO, { from: seller1 })
    log('tx: ', JSON.stringify(tx.logs, null, 2))
    log('Succeeded Withdrawing Bad GNO')
    log('startBal.startingGNO: ', startBal.startingGNO)

    const deposited = await dx.balances(badGNO.address, seller1)
    log('deposited: ', deposited.toString())

    assert(deposited.eq(0), 'deposited amount was exactly equal startingGNO')
  })
})
