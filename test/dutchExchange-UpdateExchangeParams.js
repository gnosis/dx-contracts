const {
  logger,
  assertRejects,
  gasLogger,
} = require('./utils')

const { getContracts } = require('./testFunctions')

const PriceOracleInterface = artifacts.require('PriceOracleInterface')

// Test VARS
let newPO
let dx
let medianizer

let contracts

contract('DutchExchange updating exchange params', (accounts) => {
  const [master, seller1] = accounts

  afterEach(() => gasLogger())

  before(async () => {
    // get contractsU
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      Medianizer: medianizer,
    } = contracts)

    // a new deployed PriceOracleInterface to replace the old with
    newPO = await PriceOracleInterface.new(master, medianizer.address)
  })

  const getExchangeParams = async () => {
    const [owner, ETHUSDOracle, thresholdNewTokenPair, thresholdNewAuction] = await Promise.all([
      dx.owner.call(),
      dx.ETHUSDOracle.call(),
      dx.thresholdNewTokenPair.call(),
      dx.thresholdNewAuction.call(),
    ])

    return {
      owner,
      ETHUSDOracle,
      thresholdNewTokenPair: thresholdNewTokenPair.toNumber(),
      thresholdNewAuction: thresholdNewAuction.toNumber(),
    }
  }

  const getAndPrintExchangeParams = async () => {
    const params = await getExchangeParams()
    const {
      owner,
      ETHUSDOracle,
      thresholdNewTokenPair,
      thresholdNewAuction,
    } = params

    logger(`DutchExchange parameters:
      owner: ${owner},
      ETHUSDOracle: ${ETHUSDOracle},
      thresholdNewTokenPair: ${thresholdNewTokenPair},
      thresholdNewAuction: ${thresholdNewAuction}
    `)

    return params
  }

  const updateExchangeParams = (account, {
    owner,
    ETHUSDOracle,
    thresholdNewTokenPair,
    thresholdNewAuction,
  }) => dx.updateExchangeParams(owner, ETHUSDOracle, thresholdNewTokenPair, thresholdNewAuction, { from: account })

  const assertIsOwner = async (acc) => {
    const owner = await dx.owner.call()
    assert.strictEqual(owner, acc, 'account should be DutchExchange contract owner')
  }

  const assertIsNotOwner = async (acc) => {
    const owner = await dx.owner.call()
    assert.notStrictEqual(owner, acc, 'account should not be DutchExchange contract owner')
  }

  it('not owner can\'t change params', async () => {
    const params1 = await getAndPrintExchangeParams()

    await assertIsNotOwner(seller1)

    const params2 = {
      owner: seller1,
      ETHUSDOracle: newPO.address,
      thresholdNewTokenPair: 5000,
      thresholdNewAuction: 500,
    }

    assert.notDeepEqual(params1, params2, 'parameters must be different')

    logger(`Not owner tries to change params to ${JSON.stringify(params2, null, 5)}`)

    await assertRejects(updateExchangeParams(seller1, params2), 'not owner can\'t change params')

    assert.deepEqual(params1, await getAndPrintExchangeParams(), 'exchange params should stay the same')
  })

  it('owner can change params', async () => {
    const params1 = await getAndPrintExchangeParams()

    await assertIsOwner(master)

    const params2 = {
      owner: seller1,
      ETHUSDOracle: newPO.address,
      thresholdNewTokenPair: 4000,
      thresholdNewAuction: 400,
    }

    assert.notDeepEqual(params1, params2, 'parameters must be different')

    logger(`Owner changes params to ${JSON.stringify(params2, null, 5)}`)

    await updateExchangeParams(master, params2)

    assert.deepEqual(params2, await getAndPrintExchangeParams(), 'exchange params should be changed')
  })
})
