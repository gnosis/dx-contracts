/* eslint no-console:0 */
const { getTokenBalances, giveTokens } = require('./utils/contracts')(artifacts)

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec trufflescripts/give_tokens.js
 * give tokens from master
 * @flags:
 * --seller           to seller
 * --buyer            to buyer
 * -a <address>       to the given address
 * --eth <number>     ETH tokens
 * --gno <number>     GNO tokens
 * --tul <number>     TUL tokens
 * --owl <number>     OWL tokens
 */

module.exports = async () => {
  if (!(argv.eth > 0 || argv.gno > 0 || argv.tul > 0 || argv.owl > 0) || !(argv.seller || argv.buyer || argv.a)) {
    console.warn('No tokens or accounts specified')
    return
  }

  // web3 is available in the global context
  const [master, seller, buyer] = web3.eth.accounts
  const account = argv.seller ? seller : argv.buyer ? buyer : argv.a
  const accountName = argv.seller ? 'Seller' : argv.buyer ? 'Buyer' : `Acc ${argv.a}`

  console.log(`${accountName}`)

  let { ETH, GNO, TUL, OWL } = await getTokenBalances(account)
  console.log(`Balance was:\t${ETH}\tETH,\t${GNO}\tGNO,\t${TUL}\tTUL,\t${OWL}\tOWL`)

  const tokensToGive = { ETH: argv.eth, GNO: argv.gno, TUL: argv.tul, OWL: argv.owl }

  giveTokens(account, tokensToGive, master);

  ({ ETH, GNO, TUL, OWL } = await getTokenBalances(account))
  console.log(`Balance is:\t${ETH}\tETH,\t${GNO}\tGNO,\t${TUL}\tTUL,\t${OWL}\tOWL`)
}
