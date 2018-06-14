/* eslint no-console:0 */
const { getTokenDeposits, depositToDX } = require('./utils/contracts')(artifacts)

const argv = require('minimist')(process.argv.slice(2), { string: 'a' })

/**
 * truffle exec test/trufflescripts/deposit.js
 * to deposit funds to DutchExchange contracts
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

  const tokensToDeposit = { ETH: argv.eth, GNO: argv.gno, FRT: argv.frt, OWL: argv.owl }

  await depositToDX(account, tokensToDeposit);

  ({ ETH, GNO } = await getTokenDeposits(account))
  console.log(`Deposit is:\t${ETH}\tETH,\t${GNO}\tGNO`)
}
