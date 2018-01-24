const {
  eventWatcher,
  logger,
  log,
} = require('./utils')

const { getContracts, setupTest } = require('./testFunctions')

// Test VARS
let eth
let gno
let tul
let owl
let dx
let oracle


let contracts

const separateLogs = () => log('\n    ----------------------------------')

contract('DutchExchange - settleFee', (accounts) => {
  const [master, seller1] = accounts

  const startBal = {
    startingETH: 0,
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1008.0.toWei(),
    sellingAmount: 50.0.toWei(),
  }

  beforeEach(separateLogs)

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      // DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenTUL: tul,
      TokenOWL: owl,
      // using internal contract with settleFeePub calling dx.settleFee internally
      DutchExchange: dx,
      PriceOracleInterface: oracle,
    } = contracts)

    await setupTest(accounts, contracts, startBal)

    // add tokenPair ETH GNO
    // await dx.addTokenPair(
    //   eth.address,
    //   gno.address,
    //   10 * (10 ** 18),
    //   0,
    //   2,
    //   1,
    //   { from: seller1 },
    // )

    // await tul.updateMinter(master, { from: master })
    logger('PRICE ORACLE', await oracle.getUSDETHPrice.call())

    const [sNum, sDen] = await dx.getPriceOracleForJS.call(eth.address)
    logger('ST PRICE', `${sNum}/${sDen} == ${sNum / sDen}`)
    const [bNum, bDen] = await dx.getPriceOracleForJS.call(gno.address)
    logger('BT PRICE', `${bNum}/${bDen} == ${bNum / bDen}`)

    eventWatcher(dx, 'NewSellOrder')
  })

  after(eventWatcher.stopWatching)
})
