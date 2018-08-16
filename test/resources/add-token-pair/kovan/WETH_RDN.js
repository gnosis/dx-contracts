module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: "0xd0a1e359811322d97991e03f863a0c30c2cf029c",
    // Check ETH oracle:
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 256.493
    //   10000$ = 10000/256.493 ETH = 38.98741876
    funding: 40
  },
  // RDN
  tokenB: {
    symbol: 'RDN',
    address: "0x1f7f270df126ba464228cc8d8203d2768429e085",
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/raiden-network/eth
  //   1 ETH = 859 RDN
  //   initial price = 859 RDN/WETH
  initialPrice: {
    numerator: 859,
    denominator: 1
  }
}