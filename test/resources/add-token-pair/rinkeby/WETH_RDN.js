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
  // RDN
  tokenB: {
    symbol: 'RDN',
    address: "0x3615757011112560521536258c1e7325ae3b48ae",
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/raiden-network/eth
  //   1 ETH = 584,9287264346839 RDN
  //   initial price = 585 RDN/WETH
  initialPrice: {
    numerator: 585,
    denominator: 1
  }
}