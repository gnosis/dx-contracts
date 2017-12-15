
// const Token = artifacts.require('./Token.sol')
// const DutchExchange = artifacts.require('./DutchExchange.sol')
// // const DutchExchangeFactory = artifacts.require('./DutchExchangeFactory.sol')

// contract('Auction', async (accounts) => {
//   // console.log(accounts);

//   let initialiser
//   let seller
//   let buyer

//   let sellToken
//   let buyToken
//   let DUTCHX
//   let dx

//   let dxa

//   // let dxFactory

//   beforeEach(async () => {
//     [initialiser, seller, buyer] = accounts

//     // get seller set up
//     sellToken = await Token.new()
//     await sellToken.approve(seller, 100)
//     await sellToken.transferFrom(initialiser, seller, 100, { from: seller })

//     // get buyer set up
//     buyToken = await Token.new()
//     await buyToken.approve(buyer, 1000)
//     await buyToken.transferFrom(initialiser, buyer, 1000, { from: buyer })

//     DUTCHX = await Token.new()

//     // create dx
//     dx = await DutchExchange.new(2, 1, sellToken.address, buyToken.address, DUTCHX.address)
//     dxa = dx.address

//     // dxFactory = await DutchExchangeFactory(DUTCHX.address)
//   })


//   it('seller can submit order to an auction', async () => {
//     // we know there's a deployed contract somewhere
//     const dutchExchange = DutchExchange.at(dxa)


//     const amount = 30
//     // allow the contract to move tokens
//     await sellToken.approve(dxa, amount, { from: seller })

//     // currently in auction
//     const emptyAuctionVol = await dutchExchange.sellVolumeCurrent()
//     assert.equal(emptyAuctionVol.toNumber(), 0)

//     // seller submits order and returns transaction object
//     // that includes logs of events that fired during function execution
//     const { logs: [log] } = await dutchExchange.postSellOrder(amount, { from: seller })
//     const { _auctionIndex, _from, amount: submittedAmount } = log.args

//     // submitter is indeed the seller
//     assert.equal(_from, seller)
//     // amount is the same
//     assert.equal(submittedAmount.toNumber(), amount)

//     // currently in auction
//     const filledAuctionVol = await dutchExchange.sellVolumeCurrent()

//     // auction received the exact sum from the seller
//     assert.equal(filledAuctionVol.toNumber(), emptyAuctionVol.toNumber() + amount)

//     // seller is now assigned a balance
//     const sellerBalance = await dutchExchange.sellerBalances(_auctionIndex, seller)
//     assert.equal(sellerBalance.toNumber(), amount)
//   })
// })
