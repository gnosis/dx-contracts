const TokenETH = artifacts.require('./EtherToken.sol')
const TokenGNO = artifacts.require('./TokenGNO.sol')
const TokenTUL = artifacts.require('./StandardToken.sol')
const TokenOWL = artifacts.require('./OWL.sol')

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
  if (!(argv.eth || argv.gno || argv.tul || argv.owl) || !(argv.seller || argv.buyer || argv.a)) {
    console.warn('No tokens or accounts specified')
    return
  }

  // web3 is available in the global context
  const [master, seller, buyer] = web3.eth.accounts
  const account = argv.seller ? seller : argv.buyer ? buyer : argv.a
  const accountName = argv.seller ? 'Seller' : argv.buyer ? 'Buyer' : `Acc ${argv.a}`

  const eth = await TokenETH.deployed()
  const gno = await TokenGNO.deployed()
  const tul = await TokenTUL.deployed()
  const owl = await TokenOWL.deployed()

  const getBalances = acc => Promise.all([
    eth.balanceOf(acc),
    gno.balanceOf(acc),
    tul.balanceOf(acc),
    owl.balanceOf(acc),
  ]).then(res => res.map(n => n.toNumber()))

  console.log(`${accountName}\t\tETH\tGNO`)

  let [accountETH, accountGNO, accountTUL, accountOWL] = await getBalances(account)
  console.log(`Balance was:\t${accountETH}\tETH,\t${accountGNO}\tGNO,\t${accountTUL}\tTUL,\t${accountOWL}\tOWL`)

  const transferToken = async (token, amount) => {
    if (amount) {
      try {
        await token.transfer(account, amount, { from: master })
      } catch (error) {
        console.error(error.message || error)
      }
    }
  }

  await Promise.all([
    transferToken(eth, argv.eth),
    transferToken(gno, argv.gno),
    transferToken(tul, argv.tul),
    transferToken(owl, argv.owl),
  ]);

  [accountETH, accountGNO, accountTUL, accountOWL] = await getBalances(account)
  console.log(`Balance is:\t${accountETH}\tETH,\t${accountGNO}\tGNO,\t${accountTUL}\tTUL,\t${accountOWL}\tOWL`)
}
