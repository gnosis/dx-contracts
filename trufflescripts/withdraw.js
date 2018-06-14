/* eslint no-console:0 */
const { getTokenDeposits, withrawFromDX } = require('./utils/contracts')(artifacts)

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/withdraw.js
 * to withdraw funds from DutchExchange contract
 * @flags:
 * --seller                     as the seller
 * --buyer                      as the buyer
 * -a <address>                 as the given address
 * --eth <number>               ETH tokens
 * --gno <number>               GNO tokens
 */

module.exports = async () => {
  if (!(argv.eth || argv.gno) || !(argv.seller || argv.buyer || argv.a)) {
    console.warn('No tokens or accounts specified')
    return
  }

  let account, accountName
  if (argv.a) account = accountName = argv.a
  else if (argv.seller) {
    [, account] = web3.eth.accounts
    accountName = 'Seller'
  } else {
    [, , account] = web3.eth.accounts
    accountName = 'Buyer'
  }

  console.log(`${accountName}`)

  let { ETH, GNO } = await getTokenDeposits(account)
  console.log(`Deposit was:\t${ETH}\tETH,\t${GNO}\tGNO`)

  const tokensToWithdraw = { ETH: argv.eth, GNO: argv.gno, TUL: argv.tul, OWL: argv.owl }

  await withrawFromDX(account, tokensToWithdraw);

  ({ ETH, GNO } = await getTokenDeposits(account))
  console.log(`Deposit is:\t${ETH}\tETH,\t${GNO}\tGNO`)
}
