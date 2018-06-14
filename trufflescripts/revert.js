/* eslint no-console:0 */
const { revertSnapshot } = require('./utils')(web3)

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/claim_funds.js
 * to claim funds for the current auction for both seller and buyer,
 * from auction's sellerBalances and buyerBalances respectively
 * @flags:
 * --seller                     sellerBalance for seller only
 * --buyer                      buyerBalance for buyer only
 * -a seller|buyer|<address>    for the given address
 * -i <index>                   for auction with given index
 * --last                       for last auction
 */

module.exports = async () => {
  const snapshotID = argv.b || '0x01'

  const timeout = new Promise((resolve, reject) => setTimeout(() => reject(new Error('TIMED-OUT')), 1500))
  const race = Promise.race([timeout, revertSnapshot(snapshotID)])
  try {
    await race
    console.warn(`
      CAUTION: Reverting does NOT roll back time to snapshot time. You've been warned...
    `)
    console.log(`
      REVERTED TO SNAPSHOT-ID:  # ${snapshotID}
      BLOCKNUMBER:              ${web3.eth.blockNumber}
    `)
  } catch (e) {
    console.log(e)

    // Due to lock in rpc, kill w/Node
    process.on('exit', () => {
      console.log('KILLING SCRIPT')
    })
    process.exit()
  }
}
