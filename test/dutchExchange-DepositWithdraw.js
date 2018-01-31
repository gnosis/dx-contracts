const {
  eventWatcher,
  log,
  gasLogger,
  assertRejects,
} = require('./utils')

const { getContracts } = require('./testFunctions')

// Test VARS
let eth
let gno
let dx


let contracts

contract('DutchExchange deposit/withdraw tests', (accounts) => {
  const [master] = accounts
  const testingAccs = accounts.slice(1, 5)

  const ETHBalance = 10 ** 9

  const GNOBalance = 10 ** 15

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
    } = contracts)

    // set up initial balances for accounts and allowance for dx in accounts' names
    await Promise.all(testingAccs.map(acct => Promise.all([
      eth.deposit({ from: acct, value: ETHBalance }),
      eth.approve(dx.address, ETHBalance, { from: acct }),
      gno.transfer(acct, GNOBalance, { from: master }),
      gno.approve(dx.address, GNOBalance, { from: acct }),
    ])))
  })

  afterEach(gasLogger)
  after(eventWatcher.stopWatching)

  const getAccDeposits = async (acc) => {
    const [ETH, GNO] = (await Promise.all([
      dx.balances.call(eth.address, acc),
      dx.balances.call(gno.address, acc),
    ])).map(n => n.toNumber())

    return { ETH, GNO }
  }

  const getAccBalances = async (acc) => {
    const [ETH, GNO] = (await Promise.all([
      eth.balanceOf.call(acc),
      gno.balanceOf.call(acc),
    ])).map(n => n.toNumber())

    return { ETH, GNO }
  }

  const getAccAllowance = async (owner, spender) => {
    const [ETH, GNO] = (await Promise.all([
      eth.allowance.call(owner, spender),
      gno.allowance.call(owner, spender),
    ])).map(n => n.toNumber())

    return { ETH, GNO }
  }

  it('intially deposits are 0', () => Promise.all(testingAccs.map(async (acc) => {
    const { ETH, GNO } = await getAccDeposits(acc)

    assert.strictEqual(ETH, 0, `${acc} ETH deposit should be 0`)
    assert.strictEqual(GNO, 0, `${acc} GNO deposit should be 0`)
  })))

  it('can deposit the right amount ', () => Promise.all(testingAccs.map(async (acc) => {
    const depositETH = 100
    const depositGNO = 200

    // make sure we don't deposit more than available
    assert.isBelow(depositETH, ETHBalance, 'trying to deposit more ETH than available')
    assert.isBelow(depositGNO, GNOBalance, 'trying to deposit more GNO than available')

    log(`${acc} depositing\t${depositETH} ETH,\t${depositGNO} GNO`)

    await dx.deposit(eth.address, depositETH, { from: acc })
    await dx.deposit(gno.address, depositGNO, { from: acc })

    const { ETH: ETHDep, GNO: GNODep } = await getAccDeposits(acc)

    log(`${acc} deposits:\t${ETHDep} ETH,\t${GNODep} GNO`)
    // all deposits got accepted
    assert.strictEqual(ETHDep, depositETH, 'new ETH balance in auction should be equal to deposited amount')
    assert.strictEqual(GNODep, depositGNO, 'new GNO balance in auction should be equal to deposited amount')

    const { ETH: ETHBal, GNO: GNOBal } = await getAccBalances(acc)
    // deposit amounts got correctly subtracted from account balances
    assert.strictEqual(ETHDep, ETHBalance - ETHBal, `${acc}'s ETH balance should decrease by the amount deposited`)
    assert.strictEqual(GNODep, GNOBalance - GNOBal, `${acc}'s GNO balance should decrease by the amount deposited`)
  })))

  it('can withdraw the right amount ', () => Promise.all(testingAccs.map(async (acc) => {
    const withdrawETH = 90
    const withdrawGNO = 150

    const { ETH, GNO } = await getAccDeposits(acc)

    // make sure we don't withdraw more than available
    assert.isBelow(withdrawETH, ETH, 'trying to withdraw more ETH than available')
    assert.isBelow(withdrawGNO, GNO, 'trying to withdraw more GNO than available')

    const { ETH: ETHDep1, GNO: GNODep1 } = await getAccDeposits(acc)
    const { ETH: ETHBal1, GNO: GNOBal1 } = await getAccBalances(acc)

    log(`${acc} withdrawing\t${withdrawETH} ETH,\t${withdrawGNO} GNO`)

    await dx.withdraw(eth.address, withdrawETH, { from: acc })
    await dx.withdraw(gno.address, withdrawGNO, { from: acc })

    const { ETH: ETHDep2, GNO: GNODep2 } = await getAccDeposits(acc)
    const { ETH: ETHBal2, GNO: GNOBal2 } = await getAccBalances(acc)

    log(`${acc} deposits:\t${ETHDep2} ETH,\t${GNODep2} GNO`)
    assert.strictEqual(ETHDep1 - ETHDep2, withdrawETH, 'ETH deposit should decrease by the amount withdrawn')
    assert.strictEqual(GNODep1 - GNODep2, withdrawGNO, 'GNO deposit should decrease by the amount withdrawn')

    assert.strictEqual(ETHBal2 - ETHBal1, withdrawETH, 'ETH balance should increase by the amount withdrawn')
    assert.strictEqual(GNOBal2 - GNOBal1, withdrawGNO, 'GNO balance should increase by the amount withdrawn')
  })))

  it('withdraws the whole deposit when trying to withdraw more than available', () => Promise.all(testingAccs.map(async (acc) => {
    const withdrawETH = 290
    const withdrawGNO = 350

    const { ETH: ETHDep1, GNO: GNODep1 } = await getAccDeposits(acc)

    // make sure we try to withdraw more than available
    assert.isAbove(withdrawETH, ETHDep1, 'should try to withdraw more ETH than available')
    assert.isAbove(withdrawGNO, GNODep1, 'should try to withdraw more GNO than available')

    const { ETH: ETHBal1, GNO: GNOBal1 } = await getAccBalances(acc)

    log(`${acc} trying to withdraw\t${withdrawETH} ETH,\t${withdrawGNO} GNO`)

    // DutchExchange::withdraw Math.min resulted in balances[tokenAddress][msg.sender]
    await dx.withdraw(eth.address, withdrawETH, { from: acc })
    await dx.withdraw(gno.address, withdrawGNO, { from: acc })
    // assert.throws(() => dx.withdraw(eth.address, withdrawETH, { from: acc }))

    const { ETH: ETHDep2, GNO: GNODep2 } = await getAccDeposits(acc)
    const { ETH: ETHBal2, GNO: GNOBal2 } = await getAccBalances(acc)

    log(`${acc} deposits:\t${ETHDep2} ETH,\t${GNODep2} GNO`)
    // all deposits were withdrawn
    assert.strictEqual(ETHDep2, 0, 'ETH deposit should be 0')
    assert.strictEqual(GNODep2, 0, 'GNO deposit should be 0')

    // balance increased by the actual amount withdrawn, not how uch we tried to withdraw
    assert.strictEqual(ETHBal2 - ETHBal1, ETHDep1, 'ETH balance should increase by the amount withdrawn (whole deposit)')
    assert.strictEqual(GNOBal2 - GNOBal1, GNODep1, 'GNO balance should increase by the amount withdrawn (whole deposit)')
  })))

  it('rejects when trying to wihdraw when deposit is 0', () => Promise.all(testingAccs.map(async (acc) => {
    const withdrawETH = 10
    const withdrawGNO = 20

    const { ETH: ETHDep1, GNO: GNODep1 } = await getAccDeposits(acc)

    // make sure we try to withdraw more than available
    assert.strictEqual(ETHDep1, 0, 'ETH deposit should be 0')
    assert.strictEqual(GNODep1, 0, 'GNO deposit should be 0')

    log(`${acc} trying to withdraw\t${withdrawETH} ETH,\t${withdrawGNO} GNO`)

    // transaction returned early at Log('withdraw R1')
    await assertRejects(dx.withdraw(eth.address, withdrawETH, { from: acc }), 'can\'t withdraw from 0 ETH deposit')
    await assertRejects(dx.withdraw(gno.address, withdrawGNO, { from: acc }), 'can\'t withdraw from 0 GNO deposit')

    const { ETH: ETHDep2, GNO: GNODep2 } = await getAccDeposits(acc)

    log(`${acc} deposits:\t${ETHDep2} ETH,\t${GNODep2} GNO`)

    assert.strictEqual(ETHDep1, ETHDep2, 'ETH deposit should not change')
    assert.strictEqual(GNODep1, GNODep2, 'GNO deposit should not change')
  })))

  it('rejects when trying to deposit more than balance available', () => Promise.all(testingAccs.map(async (acc) => {
    const { ETH: ETHBal1, GNO: GNOBal1 } = await getAccBalances(acc)
    const { ETH: ETHDep1, GNO: GNODep1 } = await getAccDeposits(acc)

    const depositETH = ETHBal1 + 10
    const depositGNO = GNOBal1 + 10

    log(`${acc} trying to deposit\t${depositETH} ETH,\t${depositGNO} GNO\n\t10 more than balance available`)

    // transaction returned early at Log('deposit R1')
    await assertRejects(dx.deposit(eth.address, depositETH, { from: acc }), 'can\'t deposit more than ETH balance')
    await assertRejects(dx.deposit(gno.address, depositGNO, { from: acc }), 'can\'t deposit more than GNO balance')

    const { ETH: ETHDep2, GNO: GNODep2 } = await getAccDeposits(acc)

    log(`${acc} deposits:\t${ETHDep2} ETH,\t${GNODep2} GNO`)
    assert.strictEqual(ETHDep1, ETHDep2, 'ETH deposit should not change')
    assert.strictEqual(GNODep1, GNODep2, 'GNO deposit should not change')
  })))

  it('rejects when trying to deposit more than allowance', () => Promise.all(testingAccs.map(async (acc) => {
    const { ETH: ETHAllow, GNO: GNOAllow } = await getAccAllowance(acc, dx.address)
    const { ETH: ETHDep1, GNO: GNODep1 } = await getAccDeposits(acc)

    const depositETH = ETHAllow + 10
    const depositGNO = GNOAllow + 10

    log(`${acc} trying to deposit\t${depositETH} ETH,\t${depositGNO} GNO\n\t10 more than allowance`)

    // transaction returned early at Log('deposit R1')
    await assertRejects(dx.deposit(eth.address, depositETH, { from: acc }), 'can\'t deposit more than ETH allowance')
    await assertRejects(dx.deposit(gno.address, depositGNO, { from: acc }), 'can\'t deposit more than GNO allowance')

    const { ETH: ETHDep2, GNO: GNODep2 } = await getAccDeposits(acc)

    log(`${acc} deposits:\t${ETHDep2} ETH,\t${GNODep2} GNO`)
    assert.strictEqual(ETHDep1, ETHDep2, 'ETH deposit should not change')
    assert.strictEqual(GNODep1, GNODep2, 'GNO deposit should not change')
  })))
})
