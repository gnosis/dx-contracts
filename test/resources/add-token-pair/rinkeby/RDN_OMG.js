module.exports = {
  // RDN
  tokenA: {
    symbol: 'RDN',
    address: "0x7e2331beaec0ded82866f4a1388628322c8d5af0",
    // Check ETH oracle
    //   10$ = 10/730 ETH = 0.01369863014
    // Check price for RDN/WETH in the DX
    funding: 0
  },
  // OMG
  tokenB: {
    symbol: 'OMG',
    address: "0xc57b5b272ccfd0f9e4aa8c321ec22180cbb56054",
    funding: 0
  },  
  // Price: 
  //  https://www.coingecko.com/en/coins/omisego
  //  https://www.coingecko.com/en/price_charts/raiden-network/eth
  //  
  //  57 OMG/WETH
  initialPrice: {
    numerator: 1,
    denominator: 1
  }
}