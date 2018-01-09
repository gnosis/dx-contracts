/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0, no-trailing-spaces:0 */

const PriceOracleInterface = artifacts.require('PriceOracleInterface')

const { 
  eventWatcher,
  logger,
  timestamp,
} = require('./utils')

const {
  checkBalanceBeforeClaim,
  claimBuyerFunds,
  getAuctionIndex,
  getContracts,
  postBuyOrder,
  setupTest,
  setAndCheckAuctionStarted,
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

contract('DutchExchange', (accounts) => {
  const [master, seller1, , buyer1] = accounts
  const user = seller1
  let userTulips

  before(async () => {
    // get contracts
    await setupContracts()

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts)
    
    // approve ETH
    await dx.updateApprovalOfToken(eth.address, true, { from: master })
    // approve GNO
    await dx.updateApprovalOfToken(gno.address, true, { from: master })

    assert.equal(await dx.approvedTokens.call(eth.address), true, 'ETH is approved by DX')
    assert.equal(await dx.approvedTokens.call(gno.address), true, 'GNO is approved by DX')

    // add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      10 ** 9,
      0,
      2,
      1,
      { from: seller1 },
    )
  })

  it('testing Tulip Token', async () => {
    // ASSERT Auction has started
    await setAndCheckAuctionStarted(eth, gno)

    // post buy order
    await postBuyOrder(eth, gno, false, 10 ** 9, user)

    const aucIdx = await getAuctionIndex()
    const [returned, tulips] = (await dx.claimBuyerFunds.call(eth.address, gno.address, user, aucIdx)).map(amt => amt.toNumber())
    // set global tulips state
    userTulips = tulips
    console.log(`
    RETURNED  = ${returned}
    TULIPS    = ${userTulips}
    `)

    assert.equal(returned, tulips, 'for ETH -> * pair returned tokens should equal tulips minted')
    
    const { receipt: { logs } } = await claimBuyerFunds(eth, gno, false, false, user)
    console.log(logs ? '\tCLAIMING FUNDS SUCCESSFUL' : 'CLAIM FUNDS FAILED')
    console.log(logs)

    const buyVolumes = (await dx.buyVolumes.call(eth.address, gno.address)).toNumber()
    console.log(`
    CURRENT ETH//GNO bVolume = ${buyVolumes}
    `)

    const tulFunds = (await tokenTUL.balanceOf.call(user)).toNumber()
    const lockedTulFunds = (await tokenTUL.getLockedAmount.call(user)).toNumber()
    const newBalance = (await dx.balances.call(eth.address, user)).toNumber()
    console.log(`
    USER'S TUL AMT = ${tulFunds}
    USER'S LOCKED TUL AMT = ${lockedTulFunds}

    USER'S ETH AMT = ${newBalance}
    `)

    // due to passage of time(stamp)
    assert.isAtLeast(lockedTulFunds, tulips, 'final tulip tokens are slightly > than calculated from dx.claimBuyerFunds.call')

    assert.equal(newBalance, lockedTulFunds, 'for ETH -> * pair returned tokens should equal tulips minted')
  })
  it('user can lock tokens and only unlock them 24 hours later', async () => {
    let [unlockedFunds, withdrawTime] = (await tokenTUL.unlockedTULs.call(user)).map(n => n.toNumber())    
    console.log(`
    AMT OF UNLOCKED FUNDS  = ${unlockedFunds}
    TIME OF WITHDRAWAL     = ${withdrawTime}
    `)

    assert.equal(unlockedFunds, 0, 'unlockedFunds should be 0')
    assert.equal(withdrawTime, 0, 'Withdraw time should be 0 ')

    // lock tokens - arbitarily high amt to force Math.min
    await tokenTUL.lockTokens(userTulips, { from: user })
    const totalAmtLocked = (await tokenTUL.lockTokens.call(userTulips, { from: user })).toNumber()
    console.log(`
    TOKENS LOCKED           = ${totalAmtLocked}
    `)
    assert.equal(totalAmtLocked, userTulips, 'Total locked tulips should equal total user balance of tulips')

    // unlock Tokens
    await tokenTUL.unlockTokens(userTulips, { from: user });
    ([unlockedFunds, withdrawTime] = (await tokenTUL.unlockTokens.call(userTulips, { from: user })).map(t => t.toNumber()))
    console.log(`
    AMT OF UNLOCKED FUNDS  = ${unlockedFunds}
    TIME OF WITHDRAWAL     = ${withdrawTime}
    `)
    assert.equal(unlockedFunds, userTulips, 'unlockedFunds should be = userTulips')
    // assert withdrawTime === now (in seconds) + 24 hours (in seconds) 
    assert.equal(withdrawTime, timestamp() + (24 * 3600), 'Withdraw time should be 0 ')
  })
})
