/*
  eslint prefer-const: 0,
  max-len: 0,
  object-curly-newline: 1,
  no-param-reassign: 0,
  no-console: 0,
  no-mixed-operators: 0,
  no-floating-decimal: 0,
  no-trailing-spaces: 0,
  no-multi-spaces: 0,
*/

const { 
  gasLogger,
  assertRejects,
} = require('./utils')

const {
  getContracts,
} = require('./testFunctions')

// Test VARS
let tokenOWL

let contracts

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    TokenOWL: tokenOWL,
  } = contracts)
}

contract('TokenOWL - BurnTesting', (accounts) => {
  const [master, OWLHolder, , NoOWLHolder] = accounts

  afterEach(() => gasLogger())

  before(async () => {
    // get contracts
    await setupContracts()
    await tokenOWL.transfer(OWLHolder, 10 ** 18, { from: master })
  })

  it('check that NoOWLHolder can not call the burn function', async () => {
    await assertRejects(tokenOWL.burnOWL(1, { from: NoOWLHolder }))
  })

  it('check that OWLHolder can call the burn OWL and that this costs him the OWL', async () => {
    const balanceBefore = (await tokenOWL.balanceOf.call(OWLHolder)).toNumber()
    await tokenOWL.burnOWL(10 ** 18, { from: OWLHolder })
    assert.equal(balanceBefore - 10 ** 18, (await tokenOWL.balanceOf.call(OWLHolder)).toNumber())
  })
})

