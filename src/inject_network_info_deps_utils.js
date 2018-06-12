const injectNetworksDeps = require('@gnosis.pm/util-contracts/src/util/injectNetworksDeps')
const path = require('path')

const NODE_MODULES_PATH = path.join(__dirname, '../node_modules')

injectNetworksDeps({
  buildPath: '@gnosis.pm/util-contracts/build/contracts',
  packages: [
    '@gnosis.pm/gno-token',
    '@gnosis.pm/owl-token'
  ],
  nodeModulesPath: NODE_MODULES_PATH
}).catch(console.error)
