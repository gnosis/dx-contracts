module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
    // Check ETH oracle:
    //   https://makerdao.com/feeds/#0x729d19f657bd0614b4985cf1d82531c67569197b
    //   Price: 205
    //   1000$ = 1000/205 = 4.87
    funding: 5
  },
  // GNO
  tokenB: {
    symbol: 'GNO',
    address: '0x6018bf616ec9db02f90c8c8529ddadc10a5c29dc',
    funding: 0
  },
  // Price:
  //   1 ETH = 10 GNO
  //   initial price = 859 RDN/WETH
  initialPrice: {
    numerator: 10,
    denominator: 1
  }
}
