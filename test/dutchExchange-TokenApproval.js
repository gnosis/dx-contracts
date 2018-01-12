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
  const [master] = accounts
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
})
