module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: "0xc778417e063141139fce010982780140aa0cd5ab",
    // Check ETH oracle:
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 423.960
    //   10$ = 10/423.960 ETH = 0.02358713086
    funding: 0.025
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: "0x00df91984582e6e96288307e9c2f20b38c8fece9",
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/omisego/eth
  //   1 ETH = 60.63636408838016 OMG
  //   initial price = 61 OMG/WETH
  initialPrice: {
    numerator: 61,
    denominator: 1
  }
}