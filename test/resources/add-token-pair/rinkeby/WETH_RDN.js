module.exports = {
  // WETH
  description: 'WETH-RDN',
  tokenA: {
    symbol: 'WETH',
    address: "0xc778417e063141139fce010982780140aa0cd5ab",
    // Check ETH oracle
    // 10$ = 10/730 ETH = 0.01369863014
    funding: 0.0137
  },
  // RDN
  tokenB: {
    symbol: 'RDN',
    address: "0x7e2331beaec0ded82866f4a1388628322c8d5af0",
    funding: 0
  },
  // Price: https://www.coingecko.com/en/price_charts/raiden-network/eth
  //  450 RDN/WETH
  initialPrice: {
    numerator: 450,
    denominator: 1
  }
}