module.exports = {
  // WETH
  tokenA: {
    symbol: 'WETH',
    address: '0xc778417e063141139fce010982780140aa0cd5ab',
    funding: 5
  },
  // CVC
  tokenB: {
    symbol: 'GRID',
    address: '0xB35E3E3E7A87C2B04DEc49a7b5DA7c1A23a09e64',
    funding: 0
  },
  // Price:
  //   https://www.coingecko.com/en/coins/grid?utm_content=grid&utm_medium=search_coin&utm_source=coingecko
  //   1 ETH = 1706 GRID
  //   1 * 1e18 ETH in wei = 1706 * 1e12 GRID in wei
  //      Price =  (1706 * 1e8) / (1 * 1e18)
  //      Price =  1706 / (1 * 1e6)

  initialPrice: {
    numerator: 1706,
    denominator: 1e6
  }
}
