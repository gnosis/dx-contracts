const {
  eventWatcher,
  log: utilsLog,
  assertRejects,
  timestamp,
  gasLogger,
} = require('./utils')

const { getContracts, setupTest } = require('./testFunctions')

const TokenGNO = artifacts.require('TokenGNO')

// Test VARS
let eth
let gno, gno2
let tul
let dx
let oracle

let feeRatio


let contracts, symbols

const separateLogs = () => utilsLog('\n    ----------------------------------')
const log = (...args) => utilsLog('\t', ...args)

contract('DutchExchange - addTokenPair', (accounts) => {
  const [master, seller1] = accounts

  const startBal = {
    startingETH: 90.0.toWei(),
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1008.0.toWei(),
    sellingAmount: 50.0.toWei(),
  }

  let addTokenPairDefaults

  beforeEach(separateLogs)
  afterEach(() => gasLogger())

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tul,
      DutchExchange: dx,
      PriceOracleInterface: oracle,
    } = contracts)

    await setupTest(accounts, contracts, startBal)

    eventWatcher(dx, 'NewTokenPair')
    eventWatcher(dx, 'Log')
    eventWatcher(dx, 'LogNumber')

    const totalTul = (await tul.totalTokens.call()).toNumber()
    assert.strictEqual(totalTul, 0, 'total TUL tokens should be 0')
    // then we know that feeRatio = 1 / 200
    feeRatio = 1 / 200

    addTokenPairDefaults = {
      token1: eth.address,
      token2: gno.address,
      token1Funding: 10 ** 6,
      token2Funding: 1000,
      initialClosingPriceNum: 2,
      initialClosingPriceDen: 1,
    }

    // a new deployed GNO to act as a different token
    gno2 = await TokenGNO.new(1e22, { from: master })
    await Promise.all([
      gno2.transfer(seller1, startBal.startingGNO, { from: master }),
      gno2.approve(dx.address, startBal.startingGNO, { from: seller1 }),
    ])
    await dx.deposit(gno2.address, startBal.startingGNO, { from: seller1 })

    symbols = {
      [eth.address]: 'ETH',
      [gno.address]: 'GNO',
      [gno2.address]: 'GNO2',
    }
  })

  const symb = token => symbols[token.address || token]

  after(eventWatcher.stopWatching)
})
