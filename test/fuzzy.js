/* eslint no-console:0, max-len:0, no-plusplus:0, no-mixed-operators:0 */
/* const {
  // timestamp,
  // blockNumber,
  assertRejects,
  wait,
  log: utilLog,
} = require('./utils')

// > Import files
const [
  DutchExchange,
  EtherToken,
  PriceOracle,
  PriceOracleInterface, // eslint-disable-line
  TokenGNO,
  TokenTUL,
] = ['DutchExchange', 'EtherToken', 'PriceOracle', 'PriceOracleInterface', 'TokenGNO', 'TokenTUL'].map(c => artifacts.require(c))

// > Constants
const ONE = 10 ** 18

// > Test VARS
let eth
let gno
let dx
let oracle
let tokenTUL // eslint-disable-line

// > Other Variables
// Variables must be at top so they are referencable
const tokenPairs = []

// const approvedTokens = []

function log(arg) {
  if (typeof arg === 'number') {
    utilLog('failed at', arg)
  } else if (typeof arg === 'boolean') {
    if (arg) utilLog('successful')
    else utilLog('rejected')
  }
}


async function addTokenPair() { //eslint-disable-line

}

async function updateApprovalOfToken() { //eslint-disable-line

}

async function postSellOrderConditions(i, Ts, Tb, u, aI, am) {
  switch (i) {
    case 0:
    {
      const bal = (await dx.balances(Ts, u)).toNumber()
      if (am > bal) { log(i); return false }
      break
    }
    case 1:
    {
      const lAI = (await dx.getAuctionIndex(Ts, Tb)).toNumber()
      if (aI !== lAI) { log(i); return false }
      break
    }
    case 2:
    {
      const aS = (await dx.getAuctionStart(Ts, Tb)).toNumber()
      const time = web3.eth.getBlock('latest').timestamp

      const lAI = (await dx.getAuctionIndex(Ts, Tb)).toNumber()

      if (time < aS || aS === 1) {
        if (aI !== lAI) { log(i); return false }
      } else if (aI !== lAI + 1) { log(i); return false }
      break
    }
    default:
  }

  return true
} */

/**
 * async postBuyOrderConditions
 * @param {*} i   = index
 * @param {*} Ts  = Token to Sell
 * @param {*} Tb  = Token to Buy
 * @param {*} u   = ???
 * @param {*} aI  = Auction index
 * @param {*} am  = ???
 */
/* async function postBuyOrderConditions(i, Ts, Tb, u, aI, am) { //eslint-disable-line
  switch (i) {
    case 0:
    {
      const aS = (await dx.getAuctionStart(Ts, Tb)).toNumber()
      const time = web3.eth.getBlock('latest').timestamp
      utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
      utilLog('aS, time', aS, time)
      utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
      if (aS > time) { log(i); return false }
      break
    }
    case 1:
      if (aI <= 0) { log(i); return false }
      break
    case 2:
    {
      const lAI = (await dx.getAuctionIndex(Ts, Tb)).toNumber()
      utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
      utilLog('lAI', lAI)
      utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
      if (aI !== lAI) { log(i); return false }
      break
    }
    case 3:
    {
      const cP = (await dx.closingPrices(Ts, Tb, aI)).map(x => x.toNumber())
      utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
      utilLog('cP', cP)
      utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
      if (cP[0] !== 0) { log(i); return false }
      break
    }
    default:
  }

  return true
}

async function postSellOrder(Ts, Tb, u, aI, am) {
  let expectToPass = true
  let i = 0
  while (expectToPass && i < 3) {
    expectToPass = await postSellOrderConditions(i, Ts, Tb, u, aI, am)
    i++
  }
  log(expectToPass)
  if (expectToPass) await dx.postSellOrder(Ts, Tb, aI, am, { from: u })
  else await assertRejects(dx.postSellOrder(Ts, Tb, aI, am, { from: u }), `failing sellOrder(${Ts}, ${Tb}, ${aI}, ${am}) from ${u}`)
}

async function postBuyOrder(Ts, Tb, u, aI, am, j) {
  utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
  utilLog('postBuyOrder j', j)
  utilLog('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
  let expectToPass = true
  let i = 0
  while (expectToPass && i < 4) {
    expectToPass = await postBuyOrderConditions(i, Ts, Tb, u, aI, am)
    i++
  }
  log(expectToPass)
  if (expectToPass) await dx.postBuyOrder(Ts, Tb, aI, am, { from: u })
  else await assertRejects(dx.postBuyOrder(Ts, Tb, aI, am, { from: u }), `failing buyOrder(${Ts}, ${Tb}, ${aI}, ${am}) from ${u}`)
}

async function claimSellerFunds(Ts, Tb, u, aI) {
  await dx.claimSellerFunds(Ts, Tb, u, aI, { from: u })
}

async function claimBuyerFunds(Ts, Tb, u, aI) {
  await dx.claimBuyerFunds(Ts, Tb, u, aI, { from: u })
}

// > anotherTransaction()
async function anotherTransaction(accounts, t, j) {
  if (t.length > 2) {
    // pSO & pBO are handled differently
    if (t[1] === postSellOrder || t[1] === postBuyOrder) {
      // find out if should be accepted or rejected
      await t[1](t[2], t[3], accounts[t[4]], t[5], t[6], j)
    } else { // so are cSF & cBF
      // find out if should be accepted or rejected
      await t[1](t[2], t[3], accounts[t[4]], t[5])
    }
  }
}

// > setupTest()
async function setupTest(accounts) {
  gno = await TokenGNO.deployed()
  eth = await EtherToken.deployed()
  tokenTUL = await TokenTUL.deployed()
  dx = await DutchExchange.deployed()
  oracle = await PriceOracle.deployed()

  await Promise.all(accounts.map((acct) => {
    if (acct === accounts[0]) return null

    return Promise.all([
      // deposit ETH into ETH token & approve
      eth.deposit({ from: acct, value: 10 * ONE }),
      eth.approve(dx.address, 10 * ONE, { from: acct }),

      // transfer GNO from owner & approve
      gno.transfer(acct, ONE, { from: accounts[0] }),
      gno.approve(dx.address, ONE, { from: acct }),
    ])
  }))

  // Deposit depends on ABOVE finishing first... so run here
  await Promise.all(accounts.map((acct) => {
    if (acct === accounts[0]) return null

    return Promise.all([
      dx.deposit(eth.address, ONE, { from: acct }),
      dx.deposit(gno.address, ONE, { from: acct }),
    ])
  }))

  // updating the oracle Price. Needs to be changed later to another mechanism
  await oracle.updateETHUSDPrice(700)

  // add token Pair
  await dx.addTokenPair(
    eth.address,
    gno.address,
    ONE,
    0,
    2,
    1,
    { from: accounts[1] },
  )

  tokenPairs.push([eth.address, gno.address])
}

// > selectTransaction()
async function selectTransaction() {
  // const r = Math.floor(Math.random() * 6)
  const r = Math.floor(Math.random() * 2) + 2
  const auctionAction = [
    addTokenPair,
    updateApprovalOfToken,
    postSellOrder,
    postBuyOrder,
    claimSellerFunds,
    claimBuyerFunds,
  ]
  const fn = auctionAction[r]

  let t
  if (r > 1) {
    const u = Math.floor(Math.random() * 5)

    const tokenPair = tokenPairs[Math.floor(Math.random() * tokenPairs.length)]
    let [Ts, Tb] = tokenPair
    if (Math.floor(Math.random() * 2) === 1) [Ts, Tb] = [Tb, Ts]

    const lAI = (await dx.getAuctionIndex(Ts, Tb)).toNumber()
    const aI = Math.floor(Math.random() * 3) - 1 + lAI

    t = [
      undefined,
      fn,
      Ts,
      Tb,
      u,
      aI,
    ]

    if (r <= 3) {
      const am = 1 / 10 * ONE
      t.push(am)
      t[0] = `executing ${fn.name}(${Ts.substr(0, 5)}, ${Tb.substr(0, 5)}, ${aI}, ${am / 10 ** 18}) from accounts[${u}]`
    } else {
      t[0] = `executing ${fn.name}(${Ts.substr(0, 5)}, ${Tb.substr(0, 5)}, ${u}, ${aI}) from acounts[${u}]`
    }
  } else {
    t = []
  }

  return t
}

contract('DutchExchange', async (accounts) => {
  it('sets up tests', async () => {
    await setupTest(accounts)
  })

  for (let j = 0; j < 50; j++) {
    it(`above transaction, number ${j.toString()}`, async () => {
      const t = await selectTransaction()
      utilLog(t[0])
      wait(1800)
      await anotherTransaction(accounts, t, j)
    })
  }
})
*/
