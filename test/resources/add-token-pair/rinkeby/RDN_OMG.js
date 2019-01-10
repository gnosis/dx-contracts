module.exports = {
  // RDN
  tokenA: {
    symbol: 'RDN',
    address: '0x3615757011112560521536258c1e7325ae3b48ae',
    // Check ETH oracle (i.e 500 USD/ETH)
    //   10000$ = -/500 ETH = 20 ETH
    funding: 40000
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: '0x00df91984582e6e96288307e9c2f20b38c8fece9',
    funding: 0
  },
  // Price:
  //    https://www.coingecko.com/en/price_charts/omisego/eth
  //    https://www.coingecko.com/en/price_charts/raiden-network/eth
  //
  //  The price should be in OMG/RDN (since its the RDN-OMG auction)
  //    - ETH-RDN Price = 530 RDN/WETH
  //    - ETH-OMG Price = 101 OMG/WETH
  //    - RDN-OMG Price = 101/630 = 0,1603174603 OMG/RDN
  initialPrice: {
    numerator: 101,
    denominator: 630
  }
}
