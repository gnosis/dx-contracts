/* global assert, web3 */
// `truffle test --silent` or `truffle test -s` to suppress logs
const { BN, ether } = require('openzeppelin-test-helpers')

const AUCTION_START_WAITING_FOR_FUNDING = 1
const BN_ZERO = new BN('0')
const ETH_5_WEI = ether('5')
const ETH_10_WEI = ether('10')
const ETH_20_WEI = ether('20')

const {
  silent,
  contract: contractFlag,
  gas: gasLog,
  gasTx,
  noevents
} = require('minimist')(process.argv.slice(2), { alias: { silent: 's', contract: 'c', gas: 'g', gasTx: 'gtx' } })

const log = silent
  ? () => {}
  : async (...params) => {
    const parsedParams = await Promise.all(params.map(async elem => {
      let value = elem
      const isFunction = fn => {
        return fn instanceof Function
      }

      const isPromise = pr => {
        return pr instanceof Promise
      }

      const isBN = bn => {
        return bn instanceof BN
      }

      value = isFunction(value) ? value() : value
      value = isPromise(value) ? await value : value
      value = isBN(value) ? value.toString() : value

      return value
    }))
    console.log(...parsedParams)
  }

const logger = async (desc, fn) => {
  if (!silent) {
    let value
    if (fn instanceof Promise) {
      value = await fn
    } else {
      value = fn
    }
    if (value instanceof BN) {
      value = value.toString()
    }

    log(`---- \n => ${desc} ${value ? `|| - - - - - - - - - - - > ${value}` : ''}`)
  }
}

const varLogger = (varName, varValue) => log(varName, '--->', varValue)

/**
 * gasLogWrapper
 * @param {*} obj
 */
let totalGas = 0
const gasLogWrapper = contracts => {
  const handler = {
    // intercept all GETS to contracts
    get (target, propKey) {
      const origMethod = target[propKey]
      // if prompted prop !== a FUNCTION return prop
      if (typeof origMethod !== 'function' || !origMethod.sendTransaction) {
        return origMethod
      }
      // go one level deeper into actual METHOD - here access to (.call, .apply etc)
      return new Proxy(origMethod, {
        // called if @transaction function
        async apply (target, thisArg, argumentsList) {
          const result = await Reflect.apply(target, thisArg, argumentsList)
          // safeguards against constant functions and BigNumber returns
          if (typeof result !== 'object' || !result.receipt) return result
          const { receipt: { gasUsed } } = result
          // check that BOTH gas flags are used
          gasLog && gasTx && console.info(`
          ==============================
          TX name           ==> ${propKey}
          TX gasCost        ==> ${gasUsed}
          ==============================
          `)
          totalGas += gasUsed
          return result
        }
      })
    }
  }

  if (silent) {
    return contracts
  } else {
    return contracts.map(c => new Proxy(c, handler))
  }
}

/**
 * gasLogger
 * @param {contracts from testFunctions} contracts
 */
const gasLogger = () => {
  gasLog && console.info(`
    *******************************
    TOTAL GAS
    Gas ==> ${totalGas}
    *******************************
  `)
  // reset totalGas state
  totalGas = 0
}

const assertRejects = async (q, msg) => {
  let res, catchFlag = false
  try {
    res = await q
    // checks if there was a Log event and its argument l contains string "R<number>"
    catchFlag = res.logs && !!res.logs.find(log => log.event === 'Log' && /\bR(\d+\.?)+/.test(log.args.l))
  } catch (e) {
    catchFlag = true
  } finally {
    if (!catchFlag) {
      assert.fail(res, null, msg)
    }
  }
}

const toEth = value => {
  return web3.utils.fromWei(value)
}

const blockNumber = () => web3.eth.blockNumber

const timestamp = (block = 'latest') => {
  return new Promise((resolve, reject) => {
    web3.eth.getBlock(block, false, (err, { timestamp }) => {
      if (err) {
        return reject(err)
      } else {
        resolve(timestamp)
      }
    })
  })
}

// keeps track of watched events
let stopWatching = {}
/**
 * eventWatcher                - ...watches events
 * @param {contract} contract  - dx, usually
 * @param {string} event       - name of event on DutchExchange.sol to track
 * @param {Object} args?       - not required, args to look for
 * @returns stopWatching function
 */
const eventWatcher = noevents ? () => {} : (contract, eventName, argum = {}) => {
  const eventFunc = contract[eventName]
  if (!eventFunc) {
    log(`No event ${eventName} available in the contract`)
    return null
  }

  const eventObject = eventFunc(argum).watch((err, result) => {
    const { event, args } = result
    if (err) return log(err)

    switch (event) {
      // const { args: { returned, tulipsIssued } } = result
      case 'LogNumber':
        return log(`
        LOG FOUND:
        ========================
        ${args.l} ==> ${Number(args.n).toEth()}
        ========================
        `)
      case 'ClaimBuyerFunds':
        return log(`
        LOG FOUND:
        ========================
        RETURNED      ==> ${Number(args.returned).toEth()}
        TULIPS ISSUED ==> ${Number(args.tulipsIssued).toEth()}
        ========================
        `)
      default:
        return log(`
        LOG FOUND:
        ========================
        Event Name: ${event}
        Args:
        ${JSON.stringify(args, undefined, 2)}
        ========================
        `)
    }
  })
  const contractEvents = stopWatching[contract.address] || (stopWatching[contract.address] = {})
  if (contractEvents[eventName]) contractEvents[eventName]()
  const unwatch = contractEvents[eventName] = eventObject.stopWatching.bind(eventObject)

  return unwatch
}

/**
 * eventWatcher.stopWatching    - stops watching an event
 * @param {contract} contract?  - dx, ususally,
 *                                if none specified stops watching all contracts
 * @param {string} event?       - name of event to stop watching,
 *                                if none specified stops watching all events for this contract
 */
eventWatcher.stopWatching = noevents ? () => {} : (contract, event) => {
  // if given particular event name, stop watching it
  if (contract && typeof contract === 'object' && contract.address) {
    const contractEvents = stopWatching[contract.address]

    if (!contractEvents) {
      log('contract was never watched')
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
      log(`${event} event was never watched`)
    }

    return
  }

  // otherwise stop watching all events
  const unwatchAll = () => {
    for (const key of Object.keys(stopWatching)) {
      const contractEvents = stopWatching[key]
      for (const ev of Object.keys(contractEvents)) {
        contractEvents[ev]()
      }
    }
    stopWatching = {}
  }

  // allow to be used as a direct input to mocha hooks (contract === done callback)
  if (typeof contract === 'function') {
    // don't wait if no events were watched
    if (!Object.keys(stopWatching).length) {
      contract()
      return
    }
    // unwatch after a delay as not all events a typically has been displayed
    // in case of after() hook
    setTimeout(() => {
      unwatchAll()
      contract()
    }, 500)
  } else unwatchAll()
}

const enableContractFlag = (...contractTests) => {
  const cTest = contractTests[contractFlag - 1]
  if (cTest) cTest()
  else contractTests.forEach(c => c())
}

const makeSnapshot = () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_snapshot'
    }, (err, { result }) => {
      if (err) {
        return reject(err)
      } else {
        resolve(result)
      }
    })
  })
}

const revertSnapshot = snapshotId => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_revert',
      params: [snapshotId]
    }, (err, result) => {
      if (err) {
        return reject(err)
      } else {
        resolve(result)
      }
    })
  })
}
/**
 * valMinusFee
 * It will substract the standard base fee 0.5%
 * @param {BN} Amount to substract the fee
 */
const valMinusFee = amount => amount.sub(amount.div(new BN('200')))

/**
 * valMinusCustomFee
 * @param {BN} Amount to substract the fee
 * @param {Number} Fee ratio in % (ex. 0.5%)
 */
const valMinusCustomFee = (amount, fee) => {
  assert.isAbove(fee, 0, 'Fee should always be above 0')
  // Convert fee to be used by BN (can't handle float numbers)
  const feeToBN = (1 / fee) * 100
  return amount.sub(amount.div(new BN(feeToBN.toString())))
}

module.exports = {
  AUCTION_START_WAITING_FOR_FUNDING,
  BN_ZERO,
  BN,
  ETH_5_WEI,
  ETH_10_WEI,
  ETH_20_WEI,
  silent,
  assertRejects,
  blockNumber,
  enableContractFlag,
  eventWatcher,
  gasLogger,
  gasLogWrapper,
  log,
  logger,
  toEth,
  timestamp,
  varLogger,
  makeSnapshot,
  revertSnapshot,
  valMinusFee,
  valMinusCustomFee
}
