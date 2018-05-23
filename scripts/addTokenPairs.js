const path = require('path')

var argv = require('yargs')
    .usage('Usage: $0 -f <file> [--gas num] [--gas-limit num]')
    // .positional('file', {
    //   type: 'integer',
    //   describe: 'A token symbol or address is being sold, i.e. '
    // })
    .option('gas', {
      type: 'integer',
      default: 2374235,
      describe: 'Gas for approving each token pair'
    })
    .option('gasPrice', {
      type: 'integer',
      describe: 'Gas price for approving each token pair'
    })
    .option('network', {
      type: 'string',
      default: 'development',
      describe: 'One of the ethereum networks defined in truffle config'
    })
    .option('f', {
      type: 'string',
      demandOption: true,
      describe: 'File with the list of token pairs to add'
    })
    .help('h')
    .strict()
    .argv;

// const parseArgs = require('minimist')
// const ADD_TOKENS_OPTIONS = {
//   string: ['file'],
//   default: {
//     gas: 234254
//     // gasLimit: TODO:
//   }
// }

function addTokenPair ({ description, tokenA, tokenB, initialPrice}) {
  console.log('\n\n ==============  Add token pair: %s  ==============', description)
  const price = initialPrice.numerator / initialPrice.denominator
  console.log('Initial price: ' + price)

  printTokenInfo('TokenA', tokenA)
  printTokenInfo('TokenB', tokenB)
  
}

function printTokenInfo (name, { address, funding }) {
  console.log(`${name}:
  Address: ${address}
  Funding: ${funding}`)
}

module.exports = () => {
  if (!argv._[0]) {
    cli.showHelp()
  } else {
    const { f, gas, gasPrice, network } = argv
    const tokenPairsFile = path.join('..', f)

    console.log(`Adding token pairs for:
  Network: ${network}
  Token pairs file: ${f}
  Gas: ${gas}
  Gas Price: ${gasPrice || 'default'}

`)
    // Load the file
    const tokenPairs = require(tokenPairsFile)

    // Add token pairs
    tokenPairs.forEach(addTokenPair)
  }
}
