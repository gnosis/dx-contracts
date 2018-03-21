
const HDWalletProvider = require('truffle-hdwallet-provider')
const fs = require('fs')

const mnemonic = process.env.MNEMONIC

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      gas: 6700000,
      network_id: '*',
    },
    kovan: {
      provider: function() {
                  return new HDWalletProvider(mnemonic, 'https://kovan.infura.io/');
                },
      network_id: '42',
      gas: 6700000,
      gasPrice: 25000000000,
    },
    rinkeby: {
      provider: function() {
                  return new HDWalletProvider(mnemonic, 'https://rinkeby.infura.io/');
                },
      network_id: '4',
      gas: 6700000,
      gasPrice: 25000000000,
    },
    mainnet: {
      provider: function() {
                  return new HDWalletProvider(mnemonic, 'https://mainnet.infura.io');
                },
      network_id: '0',
      gas: 6700000,
      gasPrice: 25000000000,
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
}