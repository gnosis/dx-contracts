const { getTokenBalances, giveTokens } = require('./utils/contracts')(artifacts)

const initBalances = {
  seller: { ETH: 1000, GNO: 100, TUL: 0, OWL: 100 },
  buyer: { ETH: 100, GNO: 1000, TUL: 0, OWL: 100 },
}

/**
 * truffle exec trufflescripts/topup_accounts.js
 * transfers seller 100 RTH and buyer 1000 GNO from master account
 */

module.exports = async () => {
  // web3 is available in the global context
  const [master, seller, buyer] = web3.eth.accounts

  let sellerBal = await getTokenBalances(seller)
  let buyerBal = await getTokenBalances(buyer)

  const topupIfNeeded = (acc, currentBal, neededBal) => {
    const diffBal = Object.keys(neededBal).reduce((accum, key) => {
      const left = neededBal[key] - (currentBal[key] || 0)
      if (left > 0) accum[key] = left

      return accum
    }, {})

    return giveTokens(acc, diffBal, master)
  }

  await topupIfNeeded(seller, sellerBal, initBalances.seller)
  await topupIfNeeded(buyer, buyerBal, initBalances.buyer)

  sellerBal = await getTokenBalances(seller)
  buyerBal = await getTokenBalances(buyer)

  console.log(`Seller:\t${sellerBal.ETH}\tETH,\t${sellerBal.GNO}\tGNO,\t${sellerBal.TUL}\tTUL,\t${sellerBal.OWL}\tOWL`)
  console.log(`Buyer:\t${buyerBal.ETH}\tETH,\t${buyerBal.GNO}\tGNO,\t${buyerBal.TUL}\tTUL,\t${buyerBal.OWL}\tOWL`)
}
