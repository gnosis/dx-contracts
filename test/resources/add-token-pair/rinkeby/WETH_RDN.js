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
  // RDN
  tokenB: {
    symbol: 'RDN',
    address: '0x3615757011112560521536258c1e7325ae3b48ae',
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/raiden-network/eth
  //   1 ETH = 511,3250313237714 RDN
  //   initial price = 512 RDN/WETH
  initialPrice: {
    numerator: 512,
    denominator: 1
  }
}
