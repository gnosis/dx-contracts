module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: "0xc778417e063141139fce010982780140aa0cd5ab",
    // Check ETH oracle:
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 197.500
    //   10000$ = 10000/197.500 ETH = 50.63291139240506
    funding: 50.1
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: "0x00df91984582e6e96288307e9c2f20b38c8fece9",
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/omisego/eth
  //   1 ETH = 64,2873200911311 OMG
  //   initial price = 65 OMG/WETH
  initialPrice: {
    numerator: 65,
    denominator: 1
  }
}
