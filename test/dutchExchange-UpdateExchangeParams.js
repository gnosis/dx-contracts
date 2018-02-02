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

  afterEach(gasLogger)

  before(async () => {
    // get contractsU
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      Medianizer: medianizer,
    } = contracts)

    // a new deployed PriceOracleInterface to replace the old with
    contracts.newPO = await PriceOracleInterface.new(master, medianizer.address);
    ({ newPO } = contracts)
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

    logger(`DutchExchange parameters:
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

  it('not auctioneer can\'t change params', async () => {
    const params1 = await getAndPrintExchangeParams()

    await assertIsNotAuctioneer(seller1)

    const params2 = {
      auctioneer: seller1,
      ETHUSDOracle: newPO.address,
      thresholdNewTokenPair: 5000,
      thresholdNewAuction: 500,
    }

    assert.notDeepEqual(params1, params2, 'parameters must be different')

    logger(`Not auctioneer tries to change params to ${JSON.stringify(params2, null, 5)}`)

    await assertRejects(updateExchangeParams(seller1, params2), 'not auctioneer can\'t change params')

    assert.deepEqual(params1, await getAndPrintExchangeParams(), 'exchange params should stay the same')
  })

  it('auctioneer can change params', async () => {
    const params1 = await getAndPrintExchangeParams()

    await assertIsAuctioneer(master)

    const params2 = {
      auctioneer: seller1,
      ETHUSDOracle: newPO.address,
      thresholdNewTokenPair: 4000,
      thresholdNewAuction: 400,
    }

    assert.notDeepEqual(params1, params2, 'parameters must be different')

    logger(`auctioneer changes params to ${JSON.stringify(params2, null, 5)}`)

    await updateExchangeParams(master, params2)

    assert.deepEqual(params2, await getAndPrintExchangeParams(), 'exchange params should be changed')
  })
})
