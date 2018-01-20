/* eslint no-floating-decimal:0 */
const {
  timestamp,
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
  const [master] = accounts
  const testingAccs = accounts.slice(1, 5)

  const ETHBalance = 10..toWei()

  // const GNOBalance = 40..toWei()

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

    await Promise.all(testingAccs.map(acc => Promise.all([
      dx.deposit(eth.address, ETHBalance / 2, { from: acc }),
    ])))
  })

  it('Adds Token Pair', async () => dx.addTokenPair(eth.address, gno.address, 0, 0, 2, 1, { from: accounts[1] }))

  it('DX Auction idx = 1 + Auction Start Time is > timestamp NOW [auction not started]', () => Promise.all(testingAccs.map(async (acc) => {
    assert.equal(await getAuctionIndex(), 1, 'Auction index should be moved to 1')
    assert.isAbove(await dx.getAuctionStart.call(eth.address, gno.address), timestamp(), 'auction time should be above now')
  })))

  it('DX balances cannot be more than amt deposited initially', () => Promise.all(testingAccs.map(async (acc) => {
    assert(await dx.balances.call(eth.address, acc) <= ETHBalance / 2, 'Balances cannot be more than ETHBalance / 2')
  })))

  it('DX Sell Vol = 0 - nothing posted in sell order', () => Promise.all(testingAccs.map(async (acc) => {
    assert.equal(((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()).toEth(), 0, 'SellVolumesCurrent = 0')
  })))

  it('Deposits some ETH into DX and Posts Sell Order at same time', () => Promise.all(testingAccs.map(async (acc) => {
    await dx.depositAndSell(eth.address, gno.address, 4..toWei(), { from: acc })
    const fee = 0.995

    assert.equal(((await dx.sellVolumesCurrent.call(eth.address, gno.address)).toNumber()).toEth(), (4 * testingAccs.length) * fee, 'SellVolumesCurrent = 4 * # of accts')
  })))
})
