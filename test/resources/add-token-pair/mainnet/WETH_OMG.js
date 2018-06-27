module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    // Check ETH oracle:
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 423.960
    //   20$ = 20/423.960 ETH = 0.04717426172
    funding: 0.04717426172
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: "0xd26114cd6EE289AccF82350c8d8487fedB8A0C07",
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