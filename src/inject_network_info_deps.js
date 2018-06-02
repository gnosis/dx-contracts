const networkUtils = require('@gnosis.pm/util-contracts/src/util/networkUtils')
const path = require('path')

const UTIL_CONTRACTS_CONTRACTS_PATH = '@gnosis.pm/util-contracts/build/contracts'
const NODE_MODULES_PATH = path.join(__dirname, '../node_modules')
const UTIL_CONTRACTS_BUILD_DIR = path.join(NODE_MODULES_PATH, UTIL_CONTRACTS_CONTRACTS_PATH)
const FILTER_OUT_MIGRATIONS = contract => contract.name !== 'Migrations'

const UTIL_CONTRACT_DEPS = [
  '@gnosis.pm/gno-token'
  //'@gnosis.pm/owl-token'
]

async function injectDependencies (packages) {
  console.log('Getting network info from %s', UTIL_CONTRACTS_BUILD_DIR)
  let networkInfo = await networkUtils
    .getNetworkInfo(UTIL_CONTRACTS_BUILD_DIR)
  networkInfo = networkInfo.filter(FILTER_OUT_MIGRATIONS)
  
  const contractNames = networkInfo.map(info => info.name)
  console.log('Retrieved network info for: %s', contractNames.join(', '))

  console.log('Uptate addresses for compiled contract of dependencies: %s',
    packages)

  for (var i=0; i<packages.length; i++) {
    const package = packages[i]
    console.log('\nUpdate %s:', package)
    const buildPath = path.join(
      NODE_MODULES_PATH,
      package,
      'node_modules',
      UTIL_CONTRACTS_CONTRACTS_PATH
    )
    // Merge network info with the dependencies
    await networkUtils.updateBuiltContractWithInfo({
      buildPath,
      networkInfo,
      override: false
    })
  }

  console.log('\nAll network info was merged into the dependencies')
}


injectDependencies(UTIL_CONTRACT_DEPS).catch(console.error)
