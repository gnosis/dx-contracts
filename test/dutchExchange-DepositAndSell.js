/* eslint no-floating-decimal:0 */
const {
  timestamp,
  gasLogger,
} = require('./utils')

const {
  getContracts,
  getAuctionIndex,
} = require('./testFunctions')

// Test VARS
let eth
let gno
let dx

let contracts

contract('DutchExchange deposit/withdraw tests', (accounts) => {
  const testingAccs = accounts.slice(1, 5)

  const ETHBalance = 50..toWei()
  const initialToken1Funding = 10..toWei()

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

    await Promise.all(testingAccs.map(acc => Promise.all([
      eth.deposit({ from: acc, value: ETHBalance }),
      eth.approve(dx.address, ETHBalance, { from: acc }),
    ])))

    await Promise.all(testingAccs.map(acc => dx.deposit(eth.address, ETHBalance / 2, { from: acc })))
  })

  it('Adds Token Pair', () => dx.addTokenPair(eth.address, gno.address, initialToken1Funding, 0, 2, 1, { from: accounts[1] }))

  it('DX Auction idx = 1 + Auction Start Time is > timestamp NOW [auction not started]', async () => {
    assert.equal(await getAuctionIndex(), 1, 'Auction index should be moved to 1')
    assert.isAbove(await dx.getAuctionStart.call(eth.address, gno.address), timestamp(), 'auction time should be above now')
  })

  it('DX balances cannot be more than amt deposited initially', () => Promise.all(testingAccs.map(async (acc) => {
    assert(await dx.balances.call(eth.address, acc) <= ETHBalance / 2, 'Balances cannot be more than ETHBalance / 2')
  })))

  it('DX Sell Vol = 0 - nothing posted in sell order', async () => {
    assert.equal(((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()).toEth(), (initialToken1Funding.toEth() * 0.995), 'SellVolumesCurrent = 0')
  })

  it('Deposits some ETH into DX and Posts Sell Order at same time', () => Promise.all(testingAccs.map(async (acc) => {
    await dx.depositAndSell(eth.address, gno.address, 4..toWei(), { from: acc })
    const fee = 0.995

    assert.equal((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber(), ((4..toWei() * testingAccs.length) * fee) + (initialToken1Funding * 0.995), 'SellVolumesCurrent = 4 * # of accts')
  })))
})
