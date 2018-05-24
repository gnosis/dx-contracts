module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: "0xc778417e063141139fce010982780140aa0cd5ab",
    // Check ETH oracle
    // 10$ = 10/730 ETH = 0.01369863014
    funding: 0.0137
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: "0xc57b5b272ccfd0f9e4aa8c321ec22180cbb56054",
    funding: 0
  },
  // Price: https://www.coingecko.com/en/coins/omisego
  //  57 OMG/WETH
  initialPrice: {
    numerator: 57,
    denominator: 1
  }
}