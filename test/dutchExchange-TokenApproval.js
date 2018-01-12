const {
  logger,
  assertRejects,
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

  it('intially tokens aren\'t approved', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved = await getTokenApproval(token)

    logger(`Token ${symbol} at ${token.address} is ${approved ? '' : 'NOT'} APPROVED`)

    assert.isFalse(approved, `${symbol} token shouldn't be approved yet`)
  })))

  it('owner can change token approval', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved1 = await getTokenApproval(token)

    const owner = await dx.owner.call()
    assert.strictEqual(owner, master, 'web3.eth.accounts[0] should be DutchExchange contract owner')

    logger(`Token ${symbol} at ${token.address} is ${approved1 ? '' : 'NOT'} APPROVED`)
    logger(`Owner changes ${symbol} approval to ${!approved1}`)

    await dx.updateApprovalOfToken(token.address, !approved1, { from: master })

    const approved2 = await getTokenApproval(token)
    logger(`Token ${symbol} at ${token.address} is ${approved2 ? '' : 'NOT'} APPROVED`)

    assert.strictEqual(!approved1, approved2, ` ${symbol} token should change approval`)
  })))

  it('not owner can\'t change token approval', () => Promise.all(testingTokens.map(async (token) => {
    const symbol = await token.symbol.call()
    const approved1 = await getTokenApproval(token)

    const owner = await dx.owner.call()
    assert.notStrictEqual(owner, seller1, 'web3.eth.accounts[1] should not be DutchExchange contract owner')

    logger(`Token ${symbol} at ${token.address} is ${approved1 ? '' : 'NOT'} APPROVED`)
    logger(`Not owner tries to change ${symbol} approval to ${!approved1}`)

    await assertRejects(dx.updateApprovalOfToken(token.address, !approved1, { from: seller1 }), `not owner can't change ${symbol} token approval`)

    const approved2 = await getTokenApproval(token)
    logger(`Token ${symbol} at ${token.address} is ${approved2 ? '' : 'NOT'} APPROVED`)

    assert.strictEqual(approved1, approved2, ` ${symbol} token should not change approval`)
  })))
})
