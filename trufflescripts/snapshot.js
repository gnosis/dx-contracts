/* eslint no-console:0 */
const { makeSnapshot } = require('./utils')(web3)

/**
 * truffle exec test/trufflescripts/snapshot.js
 * Created snapshot of blockchain state and assigns a Block-ID
 * Block-ID can be reverted back to via revert.js
 */

module.exports = () => {
  const snapshot = makeSnapshot()
  console.log(`
    SNAPSHOT CREATED: # ${snapshot}
    BLOCK-NUMBER:     ${web3.eth.blockNumber} 
  `)
}
