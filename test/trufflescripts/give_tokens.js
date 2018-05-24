/* eslint no-console:0 */
const { getTokenBalances, giveTokens } = require('./utils/contracts')(artifacts)

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/give_tokens.js
 * give tokens from master
 * @flags:
 * --seller           to seller
 * --buyer            to buyer
 * -a <address>       to the given address
 * --eth <number>     ETH tokens
 * --gno <number>     GNO tokens
 * --frt <number>     FRT tokens
 * --owl <number>     OWL tokens
 */

module.exports = async () => {
  if (!(argv.eth > 0 || argv.gno > 0 || argv.frt > 0 || argv.owl > 0) || !(argv.seller || argv.buyer || argv.a)) {
    console.warn('No tokens or accounts specified')
    return
  }

  // web3 is available in the global context
  const [master, seller, buyer] = web3.eth.accounts
  const account = argv.seller ? seller : argv.buyer ? buyer : argv.a
  const accountName = argv.seller ? 'Seller' : argv.buyer ? 'Buyer' : `Acc ${argv.a}`

  console.log(`${accountName}`)

  let { ETH, GNO, FRT, OWL } = await getTokenBalances(account)
  console.log(`Balance was:\t${ETH}\tETH,\t${GNO}\tGNO,\t${FRT}\tFRT,\t${OWL}\tOWL`)

  const tokensToGive = { ETH: argv.eth, GNO: argv.gno, FRT: argv.frt, OWL: argv.owl }

  giveTokens(account, tokensToGive, master);

  ({ ETH, GNO, FRT, OWL } = await getTokenBalances(account))
  console.log(`Balance is:\t${ETH}\tETH,\t${GNO}\tGNO,\t${FRT}\tFRT,\t${OWL}\tOWL`)
}
