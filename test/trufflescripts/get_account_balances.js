/* eslint no-console:0 */
const { getTokenBalances } = require('./utils/contracts')(artifacts)

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/get_account_balances.js
 * get ETH and GNO balances for seller and buyer accounts
 * @flags:
 * -a <address>       and for the given account
 */

module.exports = async () => {
  // web3 is available in the global context
  const [master, seller, buyer] = web3.eth.accounts

  const getBalancesForAccounts = (...accounts) => Promise.all(accounts.map(acc => getTokenBalances(acc)))


  const [masterBal, sellerBal, buyerBal] = await getBalancesForAccounts(master, seller, buyer)


  console.log(`Seller:\t${sellerBal.ETH}\tETH,\t${sellerBal.GNO}\tGNO,\t${sellerBal.FRT}\tFRT,\t${sellerBal.OWL}\tOWL`)
  console.log(`Buyer:\t${buyerBal.ETH}\tETH,\t${buyerBal.GNO}\tGNO,\t${buyerBal.FRT}\tFRT,\t${buyerBal.OWL}\tOWL`)
  console.log('________________________________________')
  console.log(`Master:\t${masterBal.ETH}\tETH,\t${masterBal.GNO}\tGNO,\t${masterBal.FRT}\tFRT,\t${masterBal.OWL}\tOWL`)

  if (argv.a) {
    const [{ ETH, GNO, FRT, OWL }] = await getBalancesForAccounts(argv.a)

    console.log(`\nAccount at ${argv.a} address`)
    console.log(`Balance:\t${ETH}\tETH,\t${GNO}\tGNO,\t${FRT}\tFRT,\t${OWL}\tOWL`)
  }
}
