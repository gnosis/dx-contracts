module.exports = ({ web3 }) => {
  const BN = web3.utils.BN

  return {
    toWei (amount, decimals = 18) {
      const expoential = new BN(Math.pow(10, decimals).toString())
      return (new BN(amount)).mul(expoential).toString()
    }
  }
}
