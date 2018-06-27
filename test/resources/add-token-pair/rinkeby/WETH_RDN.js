module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: "0xc778417e063141139fce010982780140aa0cd5ab",
    // Check ETH oracle:
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 423.960
    //   20$ = 20/423.960 ETH = 0.04717426172
    funding: 0.04717426172
  },
  // RDN
  tokenB: {
    symbol: 'RDN',
    address: "0x7e2331beaec0ded82866f4a1388628322c8d5af0",
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