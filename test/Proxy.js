const {
  log: utilsLog,
  assertRejects,
  gasLogger,
} = require('./utils')

const { getContracts, wait } = require('./testFunctions')

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
    await assertIsAuctioneer(master)
    log('calling dx.updateMasterCopy() as auctioneer')
    await assertRejects(dx.updateMasterCopy({ from: master }), 'should reject as startMasterCopyCountdown wasn\'t yet called')
    log('tx was rejected')
  })

  it('not auctioneer can\'t call startMasterCopyCountdown', async () => {
    await assertIsNotAuctioneer(seller1)
    log('calling dx.startMasterCopyCountdown() as not auctioneer')
    await assertRejects(dx.startMasterCopyCountdown(dxNew.address, { from: seller1 }), 'should reject as caller isn\'t the auctioneer')
    log('tx was rejected')
  })

  it('can\'t call startMasterCopyCountdown with zero dx address', async () => {
    await assertIsAuctioneer(master)
    log('calling dx.startMasterCopyCountdown() with dx address == 0')
    await assertRejects(dx.startMasterCopyCountdown(0, { from: master }), 'should reject as caller isn\'t the auctioneer')
    log('tx was rejected')
  })

  it('auctioneer can call startMasterCopyCountdown', async () => {
    await assertIsAuctioneer(master)
    log('calling dx.startMasterCopyCountdown() as auctioneer with valid dx address')
    await dx.startMasterCopyCountdown(dxNew.address, { from: master })
  })

  it('auctioneer can\'t update masterCopy before time limit', async () => {
    await assertIsAuctioneer(master)
    log('calling dx.updateMasterCopy() as auctioneer before time limit')
    await assertRejects(dx.updateMasterCopy({ from: master }), 'should reject as time hasn\t passed')
    log('tx was rejected')
  })

  it('not auctioneer can\'t update masterCopy', async () => {
    await wait(60 * 60 * 24 * 30)
    await assertIsNotAuctioneer(seller1)
    log('calling dx.updateMasterCopy() as not auctioneer after time limit')
    await assertRejects(dx.updateMasterCopy({ from: seller1 }), 'should reject as caller isn\'t the auctioneer')
    log('tx was rejected')
  })

  it('auctioneer can update masterCopy after time limit', async () => {
    await assertIsAuctioneer(master)
    const params1 = await getExchangeParams()

    log('calling dx.updateMasterCopy() as auctioneer after time limit')
    await dx.updateMasterCopy({ from: master })

    const params2 = await getExchangeParams()
    assert.deepEqual(params1, params2, 'exchange params should stay the same')
  })
})
