const TokenETH = artifacts.require('./EtherToken.sol')
const TokenGNO = artifacts.require('./TokenGNO.sol')
const TokenTUL = artifacts.require('./StandardToken.sol')
const TokenOWL = artifacts.require('./OWL.sol')

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec trufflescripts/get_account_balances.js
 * get ETH and GNO balances for seller and buyer accounts
 * @flags:
 * -a <address>       and for the given account
 */

module.exports = async () => {
  // web3 is available in the global context
  const [master, seller, buyer] = web3.eth.accounts

  const eth = await TokenETH.deployed()
  const gno = await TokenGNO.deployed()
  const tul = await TokenTUL.deployed()
  const owl = await TokenOWL.deployed()

  const getBalancesForAccounts = async (...accounts) => {
    const promisedBalances = [eth, gno, tul, owl].reduce((accum, token) => {
      accum.push(...(accounts.map(account => token.balanceOf(account))))
      return accum
    }, [])

    const balances = await Promise.all(promisedBalances)

    return balances.map(bal => bal.toNumber())
  }


  const [
    masterETH, sellerETH, buyerETH,
    masterGNO, sellerGNO, buyerGNO,
    masterTUL, sellerTUL, buyerTUL,
    masterOWL, sellerOWL, buyerOWL,

  ] = await getBalancesForAccounts(master, seller, buyer)


  console.log(`Seller:\t${sellerETH}\tETH,\t${sellerGNO}\tGNO,\t${sellerTUL}\tTUL,\t${sellerOWL}\tOWL`)
  console.log(`Buyer:\t${buyerETH}\tETH,\t${buyerGNO}\tGNO,\t${buyerTUL}\tTUL,\t${buyerOWL}\tOWL`)
  console.log('________________________________________')
  console.log(`Master:\t${masterETH}\tETH,\t${masterGNO}\tGNO,\t${masterTUL}\tTUL,\t${masterOWL}\tOWL`)

  if (argv.a) {
    const [accountETH, accountGNO, accountTUL, accountOWL] = await getBalancesForAccounts(argv.a)

    console.log(`\nAccount at ${argv.a} address`)
    console.log(`Balance:\t${accountETH}\tETH,\t${accountGNO}\tGNO,\t${accountTUL}\tTUL,\t${accountOWL}\tOWL`)
  }
}
