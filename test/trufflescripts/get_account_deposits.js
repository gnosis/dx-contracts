/* eslint no-console:0 */
const { getTokenDeposits } = require('./utils/contracts')(artifacts)

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/get_account_deposits.js
 * get ETH and GNO deposits for seller and buyer accounts
 * @flags:
 * -a <address>       and for the given account
 */

module.exports = async () => {
  // web3 is available in the global context
  const [, seller, buyer] = web3.eth.accounts

  const getDepositsForAccounts = (...accounts) => Promise.all(accounts.map(acc => getTokenDeposits(acc)))


  const [sellerBal, buyerBal] = await getDepositsForAccounts(seller, buyer)


  console.log(`Seller:\t${sellerBal.ETH}\tETH,\t${sellerBal.GNO}\tGNO`)
  console.log(`Buyer:\t${buyerBal.ETH}\tETH,\t${buyerBal.GNO}\tGNO,`)

  if (argv.a) {
    const [{ ETH, GNO, FRT, OWL }] = await getDepositsForAccounts(argv.a)

    console.log(`\nAccount at ${argv.a} address`)
    console.log(`Deposit:\t${ETH}\tETH,\t${GNO}\tGNO,\t${FRT}\tFRT,\t${OWL}\tOWL`)
  }
}
