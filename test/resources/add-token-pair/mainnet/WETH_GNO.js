module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    // Check ETH oracle
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 133.245
    //   10000$ = 10000/133.245 ETH = 75.0497204398
    funding: 75.5
  },
  // GNO
  tokenB: {
    symbol: 'GNO',
    address: '0x6810e776880c02933d47db1b9fc05908e5386b96',
    funding: 72
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/gnosis/eth
  //   1 ETH = 9,553282765896997 GNO
  //   initial price = 10 GNO
  initialPrice: {
    numerator: 10,
    denominator: 1
  }
}
