module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: '0xc778417e063141139fce010982780140aa0cd5ab',
    // Check ETH oracle:
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 500
    //   10000$ = 10000/500 ETH = 20
    funding: 20
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: '0x00df91984582e6e96288307e9c2f20b38c8fece9',
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/omisego/eth
  //   1 ETH = 100,1840982990343 OMG
  //   initial price = 101 OMG/WETH
  initialPrice: {
    numerator: 101,
    denominator: 1
  }
}
