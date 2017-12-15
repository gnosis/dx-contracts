
const TokenETH = artifacts.require('./TokenETH.sol')
const TokenGNO = artifacts.require('./TokenGNO.sol')
const DutchExchangeETHGNO = artifacts.require('./DutchExchangeETHGNO.sol')

contract('ETH to GNO auctionz', async (accounts) => {
  const [initialiser, seller, buyer] = accounts

  let ETH, GNO, dx, dxa

  before(async () => {
    // get all deployed contracts
    [ETH, GNO, dx] = await Promise.all([
      TokenETH.deployed(),
      TokenGNO.deployed(),
      DutchExchangeETHGNO.deployed(),
    ])

    /**
     * @dxa - address of DutchExchangeETHGNO
     */
    dxa = dx.address
  })

  beforeEach(async () => {
    // replenish seller's, buye's tokens

    // seller must have initial balance of ETH
    // allow a transfer
    await ETH.approve(seller, 100)
    // transfer initial balance of 100 ETH
    await ETH.transferFrom(initialiser, seller, 100, { from: seller })
    // await sellToken.transfer(seller, 100, { from: initialiser })


    // buyer must have initial balance of GNO
    // allow a transfer
    await GNO.approve(buyer, 1000)
    // transfer initial balance of 1000 GNO
    await GNO.transferFrom(initialiser, buyer, 1000, { from: buyer })
  })

  it('initialiser is ETH and GNO owner', async () => {
    const ETHowner = await ETH.owner()
    const GNOowner = await GNO.owner()

    assert.equal(initialiser, ETHowner)
    assert.equal(initialiser, GNOowner)
  })

  it('all accounts have the right balance', async () => {
    const ETHtotal = await ETH.getTotalSupply()
    const initialiserETHBalance = await ETH.balanceOf(initialiser)
    const sellerETHBalance = await ETH.balanceOf(seller)
    const buyerETHBalance = await ETH.balanceOf(buyer)

    const GNOtotal = await GNO.getTotalSupply()
    const initialiserGNOBalance = await GNO.balanceOf(initialiser)
    const sellerGNOBalance = await GNO.balanceOf(seller)
    const buyerGNOBalance = await GNO.balanceOf(buyer)

    assert.deepEqual(initialiserETHBalance.add(sellerETHBalance).add(buyerETHBalance), ETHtotal)
    assert.deepEqual(initialiserGNOBalance.add(sellerGNOBalance).add(buyerGNOBalance), GNOtotal)
  })


  it('seller can submit order to an auction', async () => {
    const amount = 30
    // allow the contract to move tokens
    await ETH.approve(dxa, amount, { from: seller })

    // currently in auction
    const emptyAuctionVol = await dx.sellVolumeCurrent()
    assert.equal(emptyAuctionVol.toNumber(), 0)

    // seller submits order and returns transaction object
    // that includes logs of events that fired during function execution
    const { logs: [log] } = await dx.postSellOrder(amount, { from: seller })
    const { _auctionIndex, _from, amount: submittedAmount } = log.args

    // submitter is indeed the seller
    assert.equal(_from, seller)
    // amount is the same
    assert.equal(submittedAmount.toNumber(), amount)

    // currently in auction
    const filledAuctionVol = await dx.sellVolumeCurrent()

    // auction received the exact sum from the seller
    assert.equal(filledAuctionVol.toNumber(), emptyAuctionVol.toNumber() + amount)

    // seller is now assigned a balance
    const sellerBalance = await dx.sellerBalances(_auctionIndex, seller)
    assert.equal(sellerBalance.toNumber(), amount)
  })
})
