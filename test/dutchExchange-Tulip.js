/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0, camelcase:0, no-multi-spaces:0 */

const PriceOracleInterface = artifacts.require('PriceOracleInterface')

const { 
  eventWatcher,
  logger,
  log,
  timestamp,
} = require('./utils')

const {
  checkBalanceBeforeClaim,
  checkUserReceivesTulipTokens,
  claimBuyerFunds,
  getAuctionIndex,
  getContracts,
  postBuyOrder,
  setupTest,
  setAndCheckAuctionStarted,
  unlockTulipTokens,
  waitUntilPriceIsXPercentOfPreviousPrice,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx
let oracle
let tokenTUL

let contracts

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    DutchExchange: dx,
    EtherToken: eth,
    TokenGNO: gno,
    TokenTUL: tokenTUL,
    PriceOracle: oracle,
  } = contracts)
}

const getBalance = async (acct, token) => ((await dx.balances.call(token.address, acct)).toNumber())

contract('DutchExchange', (accounts) => {
  const [master, seller1, seller2, buyer1, buyer2] = accounts
  const initialBalancesAmount = 10 ** 9
  // const user = seller1
  // let userTulips
  let seller1Balance, initialSellVolume 

  before(async () => {
    // get contracts
    await setupContracts()

    /*
     * SUB TEST 1: Check passed in ACCT has NO balances in DX for token passed in
     */
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, 0, 'Seller1 should have 0 balance')

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)

    /*
     * SUB TEST 2: Check passed in ACCT has NO balances in DX for token passed in
     */
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, 10 ** 9, 'Seller1 should have 10 ** 9')

    /*
     * SUB TEST 3: assert both eth and gno get approved by DX
     */
    // approve ETH
    await dx.updateApprovalOfToken(eth.address, true, { from: master })
    // approve GNO
    await dx.updateApprovalOfToken(gno.address, true, { from: master })

    assert.equal(await dx.approvedTokens.call(eth.address), true, 'ETH is approved by DX')
    assert.equal(await dx.approvedTokens.call(gno.address), true, 'GNO is approved by DX')

    /*
     * SUB TEST 4: create new token pair and assert Seller1Balance = 0 after depositing more than Balance
     */
    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      (10 ** 9 * 2),  // sellVolume for ETH - takes Math.min of amt passed in OR seller balance
      0,              // buyVolume for GNO
      2,
      1,
      { from: seller1 },
    )
    seller1Balance = await getBalance(seller1, eth)
    assert.equal(seller1Balance, 0, 'Seller1 should have 0 balance after new Token Pair add')
  })
  it('Check sellVolume', async () => {
    const sellVolumes = (await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()
    const svFee = initialBalancesAmount * 0.005
    log(`
    SELLVOLUMES === ${sellVolumes}
    FEE         === ${svFee}
    `)
    assert.equal(sellVolumes, initialBalancesAmount - svFee, 'sellVolumes === seller1Balance')
  })
  it('Buyer2 postBuyOrder + claim', async () => {
    /*
     * SUB TEST 1: MOVE TIME AFTER SCHEDULED AUCTION START TIME && ASSERT AUCTION-START =TRUE
     */
    await setAndCheckAuctionStarted(eth, gno)

    /*
     * SUB TEST 2: POSTBUYORDER - CHECK RETURNED = TULIPS VIA CLAIMBUYERFUNDS.CALL()
     */
    // post buy order
    await postBuyOrder(eth, gno, false, (10 ** 9 / 3), buyer2)
    // wait for price to drop
    await waitUntilPriceIsXPercentOfPreviousPrice(eth, gno, 1)
    // claimFunds and generate Tulips
    await checkUserReceivesTulipTokens(eth, gno, buyer2)
  })

  it('Buyer1 postBuyOrder + claim', async () => {
    eventWatcher(dx, 'NewBuyOrder', {})
    // post buy order
    await postBuyOrder(eth, gno, false, (10 ** 9 / 3), buyer1)
    // wait for price to drop
    await checkUserReceivesTulipTokens(eth, gno, buyer1)
  })

  it('BUYER1: ETH --> GNO: user can lock tokens and only unlock them 24 hours later', async () => {
    await unlockTulipTokens(buyer1)
  })

  after(() => {
    eventWatcher.stopWatching()
  })
})
