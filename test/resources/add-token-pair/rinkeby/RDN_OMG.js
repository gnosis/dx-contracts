module.exports = {
  // RDN
  tokenA: {
    symbol: 'RDN',
    address: "0x7e2331beaec0ded82866f4a1388628322c8d5af0",
    // Check ETH oracle (i.e 730 USD/ETH)
    //   10$ = 10/730 ETH = 0.01369863014 ETH
    // Check price for WETH-RDN in the DX (i.e. 450 RDN/ETH)
    //   i.e cli closing-price-official WETH-RDN 1
    //   0.0137 ETH = 0.0137 * 450 = 6.165 RDN
    funding: 6.165
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: "0xc57b5b272ccfd0f9e4aa8c321ec22180cbb56054",
    funding: 0
  },  
  // Price: 
  //    https://www.coingecko.com/en/price_charts/omisego/eth
  //    https://www.coingecko.com/en/price_charts/raiden-network/eth
  //  
  //  The price should be in OMG/RDN (since its the RDN-OMG auction)
  //    - ETH-RDN Price = 450 RDN/WETH
  //    - ETH-OMG Price = 57 OMG/WETH
  //    - RDN-OMG Price = 57/450 = 0,126666666 OMG/RDN
  initialPrice: {
    numerator: 57,
    denominator: 450
  }
}