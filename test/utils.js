/* eslint no-console:0, no-confusing-arrow:0 */
const assertRejects = async (q, msg) => {
  let res, catchFlag = false
  try {
    res = await q
  } catch (e) {
    catchFlag = true
  } finally {
    if (!catchFlag) {
      assert.fail(res, null, msg)
    }
  }
}

const blockNumber = () => web3.eth.blockNumber

const timestamp = (block = 'latest') => web3.eth.getBlock(block).timestamp

const logger = async (desc, fn) => console.log(`---- \n => ${desc} ${fn ? `|| - - - - - - - - - -  - > ${fn}` : ''}`)
/**
 * eventWatcher                - ...watches events
 * @param {contract} contract  - dx, usually
 * @param {string} event       - name of event on DutchExchange.sol to track
 * @param {Object} args?       - not required, args to look for
 */
const eventWatcher = (contract, event, args) => contract[event](args).watch((err, result) => err ? console.log(err) : console.log('Found', result))

module.exports = {
  assertRejects,
  timestamp,
  blockNumber,
  logger,
  eventWatcher,
}
