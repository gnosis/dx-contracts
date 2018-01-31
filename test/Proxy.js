const {
  log: utilsLog,
  assertRejects,
  gasLogger,
} = require('./utils')

const { getContracts } = require('./testFunctions')

const DutchExchange = artifacts.require('DutchExchange')

// Test VARS
let dx, dxNew
let pr

let contracts

const separateLogs = () => utilsLog('\n    ----------------------------------')
const log = (...args) => utilsLog('\t', ...args)

contract('DutchExchange updating exchange params', (accounts) => {
  const [master, seller1] = accounts

  beforeEach(separateLogs)
  afterEach(gasLogger)

  before(async () => {
    // get contractsU
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      Proxy: pr,
    } = contracts)

    // a new deployed PriceOracleInterface to replace the old with
    dxNew = await DutchExchange.new()
  })

  const getExchangeParams = async () => {
    const [auctioneer, ETHUSDOracle, thresholdNewTokenPair, thresholdNewAuction] = await Promise.all([
      dx.auctioneer.call(),
      dx.ETHUSDOracle.call(),
      dx.thresholdNewTokenPair.call(),
      dx.thresholdNewAuction.call(),
    ])

    return {
      auctioneer,
      ETHUSDOracle,
      thresholdNewTokenPair: thresholdNewTokenPair.toNumber(),
      thresholdNewAuction: thresholdNewAuction.toNumber(),
    }
  }

  const getAndPrintExchangeParams = async () => {
    const params = await getExchangeParams()
    const {
      auctioneer,
      ETHUSDOracle,
      thresholdNewTokenPair,
      thresholdNewAuction,
    } = params

    log(`DutchExchange parameters:
      auctioneer: ${auctioneer},
      ETHUSDOracle: ${ETHUSDOracle},
      thresholdNewTokenPair: ${thresholdNewTokenPair},
      thresholdNewAuction: ${thresholdNewAuction}
    `)

    return params
  }

  const updateExchangeParams = (account, {
    auctioneer,
    ETHUSDOracle,
    thresholdNewTokenPair,
    thresholdNewAuction,
  }) => dx.updateExchangeParams(auctioneer, ETHUSDOracle, thresholdNewTokenPair, thresholdNewAuction, { from: account })

  const assertIsAuctioneer = async (acc) => {
    const auctioneer = await dx.auctioneer.call()
    assert.strictEqual(auctioneer, acc, 'account should be DutchExchange contract auctioneer')
  }

  const assertIsNotAuctioneer = async (acc) => {
    const auctioneer = await dx.auctioneer.call()
    assert.notStrictEqual(auctioneer, acc, 'account should not be DutchExchange contract auctioneer')
  }
})
