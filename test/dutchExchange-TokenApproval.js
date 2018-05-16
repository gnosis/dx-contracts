const {
  logger,
  assertRejects,
  gasLogger,
} = require('./utils')

const { getContracts } = require('./testFunctions')

// Test VARS
let eth
let gno
let dx


let contracts

contract('DutchExchange updating token aprroval', (accounts) => {
  const [master, seller1] = accounts
  let testingTokens

  afterEach(gasLogger)
  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
    } = contracts)

    testingTokens = [eth, gno]
  })

  const getTokenApproval = (token) => {
    const addr = token.address || token

    return dx.approvedTokens.call(addr)
  }

  const getAndPrintApproval = async (token, symbol) => {
    const approved = await getTokenApproval(token)
    logger(`Token ${symbol} at ${token.address} is ${approved ? '' : 'NOT'} APPROVED`)

    return approved
  }

  const assertIsOwner = async (acc) => {
    const owner = await dx.auctioneer.call()
    assert.strictEqual(owner, acc, 'account should be DutchExchange contract owner')
  }

  const assertIsNotOwner = async (acc) => {
    const owner = await dx.auctioneer.call()
    assert.notStrictEqual(owner, acc, 'account should not be DutchExchange contract owner')
  }

  it('intially tokens aren\'t approved', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved = await getAndPrintApproval(token, symbol)

    assert.isFalse(approved, `${symbol} token shouldn't be approved yet`)
  })))

  it('not owner can\'t set token approval', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved1 = await getAndPrintApproval(token, symbol)
    assert.isFalse(approved1, `${symbol} token is not approved`)

    await assertIsNotOwner(seller1)

    logger(`Not owner tries to change ${symbol} approval to ${!approved1}`)

    await assertRejects(dx.updateApprovalOfToken([token.address], !approved1, { from: seller1 }), `not owner can't set ${symbol} token approval`)

    const approved2 = await getAndPrintApproval(token, symbol)

    assert.strictEqual(approved1, approved2, ` ${symbol} token should not change approval`)
    assert.isFalse(approved2, `${symbol} token shouldn't be approved yet`)
  })))

  it('owner can set token approval', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved1 = await getAndPrintApproval(token, symbol)
    assert.isFalse(approved1, `${symbol} token is not approved`)

    await assertIsOwner(master)

    logger(`Owner changes ${symbol} approval to ${!approved1}`)

    await dx.updateApprovalOfToken([token.address], !approved1, { from: master })

    const approved2 = await getAndPrintApproval(token, symbol)

    assert.strictEqual(!approved1, approved2, ` ${symbol} token should change approval`)
    assert.isTrue(approved2, `${symbol} token should be approved`)
  })))

  it('not owner can\'t remove token approval', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved1 = await getAndPrintApproval(token, symbol)
    assert.isTrue(approved1, `${symbol} token is approved`)

    await assertIsNotOwner(seller1)

    logger(`Not owner tries to change ${symbol} approval to ${!approved1}`)

    await assertRejects(dx.updateApprovalOfToken([token.address], !approved1, { from: seller1 }), `not owner can't remove ${symbol} token approval`)

    const approved2 = await getAndPrintApproval(token, symbol)

    assert.strictEqual(approved1, approved2, ` ${symbol} token should not change approval`)
    assert.isTrue(approved2, `${symbol} token should still be approved`)
  })))

  it('owner can remove token approval', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved1 = await getAndPrintApproval(token, symbol)
    assert.isTrue(approved1, `${symbol} token is approved`)

    await assertIsOwner(master)

    logger(`Owner changes ${symbol} approval to ${!approved1}`)

    await dx.updateApprovalOfToken([token.address], !approved1, { from: master })

    const approved2 = await getAndPrintApproval(token, symbol)

    assert.strictEqual(!approved1, approved2, ` ${symbol} token should change approval`)
    assert.isFalse(approved2, `${symbol} token should be unapproved`)
  })))
})
