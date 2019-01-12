const path = require('path')

const BASE_DIR = path.join(__dirname, '../..')
const BUILD_DIR = path.join(BASE_DIR, 'build/contracts')
const NETWORKS_FILE_PATH = path.join(BASE_DIR, 'networks.json')

module.exports = {
  buildPath: BUILD_DIR,
  networkFilePath: NETWORKS_FILE_PATH,
  buildDirDependencies: []
}
