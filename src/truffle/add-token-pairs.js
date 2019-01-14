/* global artifacts, web3 */
/* eslint no-undef: "error" */

const path = require('path')
const assert = require('assert')

const GAS = 5e5 // 500K
const DEFAULT_GAS_PRICE_GWEI = 5 // 5 GWei

// Usage example:
//  yarn add-token-pairs -h
//  MNEMONIC="your mnemonic ..." yarn add-token-pairs -f ./test/resources/add-token-pair/rinkeby/01_RDN-WETH.js --network rinkeby --dry-run
//  MNEMONIC="your mnemonic ..." yarn add-token-pairs -f ./test/resources/add-token-pair/rinkeby/01_RDN-WETH.js --network rinkeby

var argv = require('yargs')
  .usage('Usage: yarn add-token-pairs -f <file> [--gas num] [--gas-price num] [--network name] [--dry-run]')
  .option('f', {
    type: 'string',
    demandOption: true,
    describe: 'File with the list of token pairs to add'
  })
  .option('gasPrice', {
    type: 'integer',
    default: process.env.GAS_PRICE_GWEI || DEFAULT_GAS_PRICE_GWEI,
    describe: 'Gas price for adding each token pair'
  })
  .option('network', {
    type: 'string',
    default: 'development',
    describe: 'One of the ethereum networks defined in truffle config'
  })
  .option('dryRun', {
    type: 'boolean',
    default: false,
    describe: 'Dry run. Do not add the token pair, do just the validations.'
  })
  .help('h')
  .strict()
  .argv

async function addTokenPairs () {
  if (!argv._[0]) {
    argv.showHelp()
  } else {
    const { f, gasPrice, network, dryRun } = argv
    const tokenPairsFile = path.join('../..', f)
    console.log('\n **************  Add token pairs  **************\n')
    console.log(`Data:
    Dry run: ${dryRun ? 'Yes' : 'No'}
    Network: ${network}
    Token pairs file: ${f}
    Gas: ${GAS}
    Gas Price: ${gasPrice} GWei`)

    // Load the file
    const tokenPairs = require(tokenPairsFile)

    // Load the DX contract
    const contractsInfo = await loadContractsInfo()
    console.log(`\
    User account: ${contractsInfo.account}
    DX address: ${contractsInfo.dx.address}
    WETH address: ${contractsInfo.wethAddress}
    Ether balance: ${contractsInfo.etherBalance}    
    Threshold: $${contractsInfo.thresholdInUSD.toFixed(2)}
    Current Ether price: ${contractsInfo.etherPrice}
`)
    // Add token pairs
    // const tokens = getTokensFromTokenPair(tokenPairs)

    const params = {
      gasPrice,
      dryRun
    }
    console.log(`Adding ${tokenPairs.length} token pairs`)
    for (let i = 0; i < tokenPairs.length; i++) {
      // Add token (syncronously)
      await addTokenPair(tokenPairs[i], contractsInfo, params)
    }
    console.log('\n **************  End of add token pairs  **************\n')
  }
}

async function addTokenPair (tokenPair, contractsInfo, params) {
  const { tokenA, tokenB, initialPrice } = tokenPair
  const { gasPrice, dryRun } = params
  const { dx, account } = contractsInfo

  console.log('\n ==============  Add token pair: %s-%s  ==============',
    tokenA.symbol, tokenB.symbol)
  const price = initialPrice.numerator / initialPrice.denominator
  console.log('Initial price: ' + price)

  const printTokenInfo = (name, { symbol, address, funding }) => {
    console.log(`${symbol}:
    Address: ${address}
    Funding: ${funding}`)
  }
  printTokenInfo('TokenA', tokenA)
  printTokenInfo('TokenB', tokenB)
  console.log('')

  // Get auction index
  const auctionIndex = await dx
    .getAuctionIndex
    .call(tokenA.address, tokenB.address)

  if (auctionIndex.isZero()) {
    // Ensure that the user has enogh balance
    await ensureEnoughBalance(tokenA, contractsInfo)
    await ensureEnoughBalance(tokenB, contractsInfo)

    // Ensure that the funding surplus the threshold
    await ensureEnoughFunding(tokenA, tokenB, contractsInfo)

    // Prepare the args for addTokenPair
    const addTokenArgs = [
      tokenA.address,
      tokenB.address,
      tokenA.funding * 1e18,
      tokenB.funding * 1e18,
      initialPrice.numerator,
      initialPrice.denominator
    ]
    console.log(`Add token arguments (token1, token2, token1Funding, \
  token2Funding, initialClosingPriceNum, initialClosingPriceDen):\n\t %s\n`,
    addTokenArgs.join(', '))

    if (dryRun) {
      // Dry run
      console.log('The dry run execution passed all validations')
      await dx.addTokenPair.call(
        ...addTokenArgs, {
          from: account
        })
      console.log('Dry run success!')
    } else {
      // Real add token pair execution
      console.log('Adding token pairs with account: ' + account)
      const addTokenResult = await dx.addTokenPair(
        ...addTokenArgs, {
          from: account,
          gas: GAS,
          gasPrice: gasPrice * 1e9
        })
      console.log('Success! The token pair was added. Transaction: ' + addTokenResult.tx)
    }
  } else {
    console.log(`The token pair is already in the DX (index=${auctionIndex}). There's nothing to do`)
  }
}

async function ensureEnoughBalance (token, { account, wethAddress, etherBalance, GnosisStandardToken, dx }) {
  const { address: tokenAddress, funding, symbol } = token
  if (funding === 0) {
    // If we don fund the token, we can skip the balance check
    return
  }

  const tokenContract = GnosisStandardToken.at(tokenAddress)

  // dx.deposit.call(tokenAddress)
  const [ balanceToken, balanceDx ] = await Promise.all([
    // Get balance of the token ERC20 for the user
    tokenContract
      .balanceOf
      .call(account),

    // Get balance in DX for the token
    dx.balances
      .call(tokenAddress, account)
  ])

  const balanceDxValue = balanceDx.div(1e18)
  const balanceTokenValue = balanceToken.div(1e18)
  if (balanceDxValue.lessThan(funding)) {
    let totalTokenBalance = balanceDxValue.plus(balanceTokenValue)
    let balancesString = `\
Balance DX: ${balanceDxValue}, \
Balance Token: ${balanceTokenValue}, \
Funding: ${funding}`

    if (totalTokenBalance.lessThan(funding)) {
      if (tokenAddress === wethAddress) {
        // If the token is WETH, the user may wrap ether
        totalTokenBalance = totalTokenBalance.plus(etherBalance)
        balancesString = 'Balance Ether: ' + etherBalance + ', ' + balancesString
      }

      if (totalTokenBalance.lessThan(funding)) {
        // The user doesn't have enough tokens
        throw new Error(`The account doesn't have enough balance for token \
${symbol}. ${balancesString}`)
      } else {
        throw new Error(`The account has enough balance for token \
${symbol}, but it needs to wrap Ether and deposit it into the DX. ${balancesString}`)
      }
    } else {
      // The has enough tokens, but not in the DX
      throw new Error(`The account has enough balance for token \
${symbol}, but it needs to deposit it into the DX. ${balancesString}`)
    }
  }
}

async function ensureEnoughFunding (tokenA, tokenB, {
  dx, etherPrice, wethAddress, thresholdInUSD
}) {
  let fundingInEtherA, fundingInEtherB
  if (tokenA.address === wethAddress) {
    // tokenA is WETH
    fundingInEtherA = tokenA.funding
    fundingInEtherB = 0
  } else if (tokenB.address === wethAddress) {
    // tokenB is WETH
    fundingInEtherA = 0
    fundingInEtherB = tokenB.funding
  } else {
    // None of the tokens is WETH
    const wethToken = { address: wethAddress, symbol: 'WETH' }
    const tokenAPriceInWeth = await getPriceInPastAuction(tokenA, wethToken, dx)
    fundingInEtherA = tokenAPriceInWeth.mul(tokenA.funding)

    const tokenBPriceInWeth = await getPriceInPastAuction(tokenB, wethToken, dx)
    fundingInEtherB = tokenBPriceInWeth.mul(tokenB.funding)
  }

  // Get the funding in USD
  const fundingInUsdA = etherPrice.mul(fundingInEtherA)
  const fundingInUsdB = etherPrice.mul(fundingInEtherB)

  let enoughFunding = false
  if (fundingInUsdA.greaterThanOrEqualTo(thresholdInUSD)) {
    enoughFunding = true
  }

  if (fundingInUsdB.mul(etherPrice).greaterThanOrEqualTo(thresholdInUSD)) {
    enoughFunding = true
  }

  if (!enoughFunding) {
    throw new Error(`Insufficient funding. \
${tokenA.symbol}: $${fundingInUsdA.toFixed(2)}, \
${tokenB.symbol}: $${fundingInUsdB.toFixed(2)}, \
threshold in USD: $${thresholdInUSD}`)
  }
}

async function getPriceInPastAuction (tokenA, tokenB, dx) {
  const addressA = tokenA.address
  const addressB = tokenB.address

  const auctionIndex = await dx
    .getAuctionIndex
    .call(addressA, addressB)

  assert(!auctionIndex.isZero(), `The token pair ${tokenA.symbol}-${tokenB.symbol} doesn't exist in the DX`)

  const priceFraction = await dx
    .getPriceInPastAuction
    .call(addressA, addressB, auctionIndex)

  const [ numerator, denominator ] = priceFraction
  return numerator.div(denominator)
}

async function loadContractsInfo () {
  const DXProxy = artifacts.require('DutchExchangeProxy')
  const DutchExchange = artifacts.require('DutchExchange')
  const GnosisStandardToken = artifacts.require('GnosisStandardToken')
  const PriceOracleInterface = artifacts.require('PriceOracleInterface')

  // Get contract examples
  const dxProxy = await DXProxy.deployed()
  const dx = DutchExchange.at(dxProxy.address)

  // Get some data from dx
  const [
    wethAddress,
    thresholdInUSD,
    ethUSDOracleAddress,
    accounts
  ] = await Promise.all([
    // Get weth address
    dx.ethToken.call(),

    // Get threshold in USD
    dx.thresholdNewTokenPair
      .call()
      .then(thresholdInWei => thresholdInWei.div(1e18)),

    // Get oracle address
    dx.ethUSDOracle.call(),

    // get Accounts
    new Promise((resolve, reject) => {
      web3.eth.getAccounts((error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })
    })
  ])

  // Get ether price from oracle
  const oracle = PriceOracleInterface.at(ethUSDOracleAddress)
  const etherPrice = await oracle.getUSDETHPrice.call()

  // Get the ether balance
  const account = accounts[0]
  const etherBalance = await new Promise((resolve, reject) => {
    web3.eth.getBalance(account, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(result.div(1e18))
      }
    })
  })

  return {
    dx,
    etherPrice,
    wethAddress,
    etherBalance,
    thresholdInUSD,
    GnosisStandardToken,
    account
  }
}

// function getTokensFromTokenPair (tokenPairs) {
//   const addToken = (tokens, token) =>{
//     const { symbol, address } = token
//     const token = symbols[symbol]

//     if (token) {
//       // We do a validation of coherence (same symbols, must have same addresses)
//       if (token.address !== address) {
//         throw new Error(`The file has an incoherence for token ${symbol}. \
// It has at least 2 different addresses: ${token.address} and ${address}`)
//       }
//     } else {
//       // Add the token
//       tokens[symbol] = token
//     }

//   }

//   return tokenPairs.reduce((tokens, { tokenA, tokenB }) => {
//     addToken(tokens, tokenA)
//     addToken(tokens, tokenB)

//     return tokens
//   }, {})
// }

module.exports = callback => {
  addTokenPairs()
    .then(callback)
    .catch(callback)
}
