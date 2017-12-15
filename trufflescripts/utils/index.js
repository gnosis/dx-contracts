/* eslint no-console:0 */
module.exports = (web3) => {
  const getTime = (blockNumber = 'latest') => web3.eth.getBlock(blockNumber).timestamp

  const increaseTimeBy = (seconds) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [seconds],
      id: 0,
    })

    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_mine',
      params: [],
      id: 0,
    })
  }

  const setTime = (seconds) => {
    const increaseBy = seconds - getTime()
    if (increaseBy < 0) {
      throw new Error('Can\'t decrease time in testrpc')
    }

    increaseTimeBy(increaseBy)
  }

  const makeSnapshot = () => web3.currentProvider.send({ jsonrpc: '2.0', method: 'evm_snapshot' }).result

  const revertSnapshot = snapshotID => new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({ jsonrpc: '2.0', method: 'evm_revert', params: [snapshotID] }, (err) => {
      if (!err) {
        console.log('Revert Success')
        resolve(snapshotID)
      } else {
        reject(err)
      }
    })
  })

  return {
    getTime,
    increaseTimeBy,
    setTime,
    makeSnapshot,
    revertSnapshot,
  }
}
