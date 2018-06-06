const injectNetworksDeps = require('@gnosis.pm/util-contracts/src/util/injectNetworksDeps')
const path = require('path')

const NODE_MODULES_PATH = path.join(__dirname, '../node_modules')

injectNetworksDeps({
  buildPath: '@gnosis.pm/gno-token/build/contracts',
  packages: [
    '@gnosis.pm/owl-token'
  ],
  nodeModulesPath: NODE_MODULES_PATH
}).catch(console.error)
