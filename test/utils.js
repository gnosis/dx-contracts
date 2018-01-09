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
let stopWatching = {}
/**
 * eventWatcher                - ...watches events
 * @param {contract} contract  - dx, usually
 * @param {string} event       - name of event on DutchExchange.sol to track
 * @param {Object} args?       - not required, args to look for
 * @returns stopWatching function
 */
const eventWatcher = (contract, event, args) => {
  const eventObject = contract[event](args).watch((err, result) => err ? console.log(err) : console.log('Found', result))
  const contractEvents = stopWatching[contract.address] || (stopWatching[contract.address] = {})
  const unwatch = contractEvents[event] = eventObject.stopWatching.bind(eventObject)

  return unwatch
}

/**
 * eventWatcher.stopWatching    - stops watching an event
 * @param {contract} contract?  - dx, ususally,
 *                                if none specified stops watching all contracts
 * @param {string} event?       - name of event to stop watching,
 *                                if none specified stops watching all events for this contract
 */
eventWatcher.stopWatching = (contract, event) => {
  // if given particular event name, stop watching it
  if (contract && typeof contract === 'object' && contract.address) {
    const contractEvents = stopWatching[contract.address]

    if (!contractEvents) {
      console.log('contract was never watched')
      return
    }

    // if event isn't specified
    // stop watching all for this contract
    if (!event) {
      for (const ev of Object.keys(contractEvents)) {
        contractEvents[ev]()
      }
      delete stopWatching[contract.address]
      return
    }

    // stop watching a single event
    const unwatch = contractEvents[event]
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
    const contractEvents = stopWatching[key]
    for (const ev of Object.keys(contractEvents)) {
      contractEvents[ev]()
    }
  }
  stopWatching = {}

  // allow to be used as a direct input to mocha hooks (contract === done callback)
  if (typeof contract === 'function') {
    contract()
  }
}

module.exports = {
  assertRejects,
  timestamp,
  blockNumber,
  logger,
  eventWatcher,
}
