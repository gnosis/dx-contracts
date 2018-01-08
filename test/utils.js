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

// keeps track of watched events
const stopWatching = {}
/**
 * eventWatcher                - ...watches events
 * @param {contract} contract  - dx, usually
 * @param {string} event       - name of event on DutchExchange.sol to track
 * @param {Object} args?       - not required, args to look for
 * @returns stopWatching function
 */
const eventWatcher = (contract, event, args) => {
  const eventObject = contract[event](args).watch((err, result) => err ? console.log(err) : console.log('Found', result))
  const unwatch = stopWatching[event] = eventObject.stopWatching.bind(eventObject)

  return unwatch
}

eventWatcher.stopWatching = (event) => {
  // if given particular event name, stop watching it
  if (event && typeof event === 'string') {
    const unwatch = stopWatching[event]
    if (unwatch) {
      unwatch()
      delete stopWatching[event]
    } else {
      console.log(`${event} event was never watched`)
    }

    return
  }

  // otherwise stop watching all events
  for (const key of Object.keys(stopWatching)) {
    stopWatching[key]()
    delete stopWatching[key]
  }
}

module.exports = {
  assertRejects,
  timestamp,
  blockNumber,
  logger,
  eventWatcher,
}
