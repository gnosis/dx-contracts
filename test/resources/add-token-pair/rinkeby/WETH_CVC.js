module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: '0xc778417e063141139fce010982780140aa0cd5ab',
    funding: 5
  },
  // CVC
  tokenB: {
    symbol: 'CVC',
    address: '',
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/price_charts/raiden-network/eth
  //   1 ETH = 3176 CVC
  //   1 * 1e18 ETH in wei = 3176 * 1e8 CVC in wei
  //      Price =  (3176 * 1e8) / (1 * 1e18)
  //      Price =  3176 / (1 * 1e10)

  initialPrice: {
    numerator: 3176,
    denominator: 1e10
  }
}
