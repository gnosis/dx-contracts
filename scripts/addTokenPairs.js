const path = require('path')
const assert = require('assert')
// Example: yarn add-token-pairs -f ./test/resources/add-token-pair/rinkeby/token-pairs.js

var argv = require('yargs')
    .usage('Usage: $0 -f <file> [--gas num] [--gas-price num] [--network name]')
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

async function addTokenPairs () {
  if (!argv._[0]) {
    cli.showHelp()
  } else {
    const { f, gas, gasPrice, network } = argv
      const tokenPairsFile = path.join('..', f)
  
      console.log(`Adding token pairs for:
    Network: ${network}
    Token pairs file: ${f}
    Gas: ${gas}
    Gas Price: ${gasPrice || 'default'}`)
      // Load the file
      const tokenPairs = require(tokenPairsFile)
  
      // Load the DX contract
      const contractsInfo = await loadContractsInfo()
      console.log(`\
    Deployer account: ${contractsInfo.account}
    DX address: ${contractsInfo.dx.address}
    WETH address: ${contractsInfo.wethAddress}
    Threshold: $${contractsInfo.thresholdInUSD.toFixed(2)}
    Current Ether price: ${contractsInfo.etherPrice}
`)
      // Add token pairs
      const params = {
        gas,
        gasPrice,
        network
      }
      for (var i=0; i<tokenPairs.length; i++) {
        // Add token (syncronously)
        await addTokenPair(tokenPairs[i], contractsInfo, params)
      }
  }
}

async function addTokenPair (tokenPair, contractsInfo, params) {
  const { description, tokenA, tokenB, initialPrice } = tokenPair
  const { gas, gasPrice, network } = params
  const {
    dx,
    etherPrice,
    wethAddress,
    thresholdInUSD,
    StandardToken,
    account
  } = contractsInfo

  console.log('\n ==============  Add token pair: %s  ==============', description)  
  const price = initialPrice.numerator / initialPrice.denominator
  console.log('Initial price: ' + price)

  const printTokenInfo = (name, { address, funding }) => {
    console.log(`${name}:
    Address: ${address}
    Funding: ${funding}`)
  }
  printTokenInfo('TokenA', tokenA)
  printTokenInfo('TokenB', tokenB)
  console.log('')

  // Ensure that the user has enogh balance
  await ensureEnoughBalance(tokenA, contractsInfo)
  await ensureEnoughBalance(tokenB, contractsInfo)

  // Ensure that the funding surplus the threshold
  await ensureEnoughFunding(tokenA, tokenB, contractsInfo)

  // Get auction index
  const auctionIndex = await dx
    .getAuctionIndex
    .call(tokenA.address, tokenB.address)

  // Check if the token pair has already been added
  if (auctionIndex.isZero()) {
    console.warn('The token pair is not in the DX, adding token pair')

  } else {
    console.warn('Skiping the token pair, it has already been deployed. AuctionIndex = ' + auctionIndex.toNumber())
  }
}

async function ensureEnoughBalance (token, { account, StandardToken }) {
  const tokenContract = StandardToken.at(token.address)

  const balance = await tokenContract
    .balanceOf
    .call(account)

  const balanceValue = balance.div(1e18)
  if (balanceValue.lessThanOrEqualTo(token.funding)) {
    throw new Error(`The account doesn't have enough balance for token ${token.address}. \
Balance: ${balanceValue}. \
Funding: ${token.funding}`)
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
    const tokenAPriceInWeth = getPriceInPastAuction(tokenA.address, wethAddress)
    fundingInEtherA = tokenA.funding.mul(tokenAPriceInWeth)

    const tokenBPriceInWeth = getPriceInPastAuction(tokenB.address, wethAddress)
    fundingInEtherB = tokenB.funding.mul(tokenBPriceInWeth)
  }

  // Get the funding in USD
  const fundingInUsdA = etherPrice.mul(fundingInEtherA)
  const fundingInUsdB = etherPrice.mul(fundingInEtherB)

  let enoughFunding = false
  console.debug(`Is ${fundingInUsdA} grater than ${thresholdInUSD}?`)
  if (fundingInUsdA.greaterThanOrEqualTo(thresholdInUSD)) {
    enoughFunding = true
  }

  console.debug(`Is ${fundingInUsdB} grater than ${thresholdInUSD}?`)
  if (fundingInUsdB.mul(etherPrice).greaterThanOrEqualTo(thresholdInUSD)) {
    enoughFunding = true
  }

  if (!enoughFunding) {
    throw new Error(`Insufficient funding. \
tokenA: $${fundingInUsdA.toFixed(2)}, \
tokenB: $${fundingInUsdB.toFixed(2)}, \
threshold in USD: $${thresholdInUSD}`)
  }
}

async function getPriceInPastAuction (addressA, addressB) {
  const auctionIndex = await dx
    .getAuctionIndex
    .call(addressA, addressB)
  
  assert(auctionIndex.isZero() > 0, `The token ${tokenA}-${tokenB} doesn't exist`)

  return dx
    .getPriceInPastAuction
    .call(addressA, addressB, auctionIndex)
}

async function loadContractsInfo () {
  const Proxy = artifacts.require('Proxy')
  const DutchExchange = artifacts.require('DutchExchange')
  const StandardToken = artifacts.require('StandardToken')
  const PriceOracleInterface = artifacts.require('PriceOracleInterface')

  // Get contract examples
  const proxy = await Proxy.deployed()
  const dx = DutchExchange.at(proxy.address)  

  // Get some data from dx
  const [ wethAddress, thresholdInUSD, ethUSDOracleAddress, accounts ] = await Promise.all([
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

  return {
    dx,
    etherPrice,
    wethAddress,
    thresholdInUSD,
    StandardToken,
    account: accounts[0]
  }
}

module.exports = (callback) => {
  addTokenPairs()
    .then(() => {
      console.log('Success! All token pairs has been added')
      callback()
    })
    .catch(error => {
      callback(error)
    })
}
