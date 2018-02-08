module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 6700000,
    },
    kovan: {
      host: "127.0.0.1",
      port: 8545,
      network_id: '42', // Match any network id
      gas: 6700000,
    },
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
}
