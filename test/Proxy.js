const {
  log: utilsLog,
  assertRejects,
  gasLogger,
} = require('./utils')

const { getContracts, wait } = require('./testFunctions')

const InternalTests = artifacts.require('InternalTests')

// Test VARS
let dx, dxNew, ethToken
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
      EtherToken: ethToken,
      // dxNew has new code as it is an InternalTests contract
      DutchExchangeProxy: pr,
    } = contracts)
    const initParams = await getExchangeParams(dx)
    dxNew = await InternalTests.new(...initParams)
  })

  const getExchangeParams = async (dxContr = dx) => {
    const [frtToken,
      owlToken,
      auctioneer,
      eth,
      ethUSDOracle,
      thresholdNewTokenPair,
      thresholdNewAuction] = await Promise.all([
      dxContr.frtToken.call(),
      dxContr.owlToken.call(),
      dxContr.auctioneer.call(),
      dxContr.ethToken.call(),
      dxContr.ethUSDOracle.call(),
      dxContr.thresholdNewTokenPair.call(),
      dxContr.thresholdNewAuction.call(),
    ])

    return [
      frtToken,
      owlToken,
      auctioneer,
      eth,
      ethUSDOracle,
      thresholdNewTokenPair.toNumber(),
      thresholdNewAuction.toNumber(),
    ]
  }

  const assertIsAuctioneer = async (acc) => {
    const auctioneer = await dx.auctioneer.call()
    assert.strictEqual(auctioneer, acc, 'account should be DutchExchange contract auctioneer')
  }

  const assertIsNotAuctioneer = async (acc) => {
    const auctioneer = await dx.auctioneer.call()
    assert.notStrictEqual(auctioneer, acc, 'account should not be DutchExchange contract auctioneer')
  }

  it('DutchExchange is initialized and params are set', async () => {
    const ethTokenAddress = await dx.ethToken.call()
    assert.strictEqual(ethTokenAddress, ethToken.address, 'DutchExchange should be initialized')

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

    assert.notEqual(await dx.getMasterCopy(), dxNew.address, 'address should not yet be the same')
    log(`DutchExchange contract is at the ${dx.address} address`)

    log('calling dx.updateMasterCopy() as auctioneer after time limit')
    await dx.updateMasterCopy({ from: master })

    // using a new interface as masterCopy is an InternalTests now
    const ndx = InternalTests.at(pr.address)
    const params2 = await getExchangeParams(ndx)
    assert.deepEqual(params1, params2, 'exchange params should stay the same')

    assert.strictEqual(await ndx.getMasterCopy.call(), dxNew.address, 'masterCopy address should have changed')
    log(`DutchExchange contract is now at the ${dxNew.address} address`)
  })
})
