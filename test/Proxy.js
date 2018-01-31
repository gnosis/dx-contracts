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

contract('DutchExchange - Proxy', (accounts) => {
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
    const [auctioneer, TUL, OWL, ETH, ETHUSDOracle, thresholdNewTokenPair, thresholdNewAuction] = await Promise.all([
      dx.auctioneer.call(),
      dx.TUL.call(),
      dx.OWL.call(),
      dx.ETH.call(),
      dx.ETHUSDOracle.call(),
      dx.thresholdNewTokenPair.call(),
      dx.thresholdNewAuction.call(),
    ])

    return {
      auctioneer,
      TUL,
      OWL,
      ETH,
      ETHUSDOracle,
      thresholdNewTokenPair: thresholdNewTokenPair.toNumber(),
      thresholdNewAuction: thresholdNewAuction.toNumber(),
    }
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

  it('DutchExchange is initialized and params are set', async () => {
    const isInitialised = await dx.isInitialised.call()
    assert.isTrue(isInitialised, 'DutchExchange should be initialized')

    const params = await getExchangeParams()
    assert.isTrue(Object.values(params).every(param => !!+param), 'No zero-initialized parameters')
  })

  it('masterCopy can\'t be updated before masterCopyCountdown was started', async () => {
    assertIsAuctioneer(master)
    log('calling dx.updateMasterCopy() as auctioneer')
    await assertRejects(dx.updateMasterCopy({ from: master }), 'should reject as startMasterCopyCountdown wasn\'t yet called')
    log('tx was rejected')
  })
})
