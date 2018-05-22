const HDWalletProvider = require('truffle-hdwallet-provider')

// Get the mnemonic
const mnemonic = process.env.MNEMONIC

// Allow to add an aditional network (useful for docker-compose setups)
//  i.e. NETWORK='{ "name": "docker", "networkId": "99999", "url": "http://rpc:8545", "gas": "6700000", "gasPrice": "25000000000"  }'
const aditionalNetworkJson = process.env.NETWORK

let aditionalNetwork = process.env.NETWORK ? JSON.parse(process.env.NETWORK) : null

const networks = {
  development: {
    host: 'localhost',
    port: 8545,
    gas: 6700000,
    network_id: '*',
  },
  live: {
    provider: function() {
      return new HDWalletProvider(mnemonic, 'https://mainnet.infura.io/');
    },
    network_id: '1',
    gas: 4612388,
    gasPrice: 10000000000,
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
      return new HDWalletProvider(mnemonic, 'http://node.rinkeby.gnosisdev.com:8545');
    },
    network_id: '4',
    gas: 6700000,
    gasPrice: 50000000000,
  },
  mainnet: {
    provider: function() {
      return new HDWalletProvider(mnemonic, 'https://mainnet.infura.io');
    },
    network_id: '0',
    gas: 6700000,
    gasPrice: 25000000000,
  }
}

if (aditionalNetwork) {
  const { name, url, networkId, gas, gasPrice } = aditionalNetwork
  networks[name] = {
    provider: function() {
      return new HDWalletProvider(mnemonic, url);
    },
    network_id: '42',
    gas,
    gasPrice,
  }
}

module.exports = {
  networks,
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
}