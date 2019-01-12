module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    // Check ETH oracle
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 423.960
    //   20$ = 20/423.960 ETH = 0.04717426172
    funding: 0.04717426172
  },
  // RDN
  tokenB: {
    symbol: 'RDN',
    address: "0x255aa6df07540cb5d3d297f0d0d4d84cb52bc8e6",
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/raiden-network/eth
  //   1 ETH = 585.9071747263082 RDN
  //   initial price = 586 RDN/WETH
  initialPrice: {
    numerator: 586,
    denominator: 1
  }
}