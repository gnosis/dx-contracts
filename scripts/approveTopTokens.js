function getAddressFromName (code, addresses) {
  allAddresses = addresses.filter(
    function (addresses) { return addresses.symbol == code }
  )
  if (allAddresses.length != 1) {
  	console.log('could not find unique address for ' + code)
    return ''
  }
  return allAddresses[0].address
}
var fs = require('fs')

function readFiles (dirname, onFileContent, onError) {
  fs.readdir(dirname, function (err, filenames) {
    if (err) {
      onError(err)
      return
    }
    d = []
    filenames.forEach(function (filename) {
      d.push(JSON.parse(fs.readFileSync(dirname + filename, 'utf-8')))
    })
  	onFileContent(d)
  })
}
/**
 * node scritps/approveTokenForDutchX.js
 * to add a new TradingPair ETH:Token to the DutchExchange
 * @flags:
 * --network                    if not specified, testrpc will be used. Otherwise rinkeby
 */

const Web3 = require('web3')
fs = require('fs')
const argv = require('minimist')(process.argv.slice(2), { string: 'a', string: ['network']})

const privKey = process.env.PrivateKEY // raw private key
const HDWalletProvider = require('truffle-hdwallet-provider-privkey')

let web3, provider
if (argv.network) {
  if (argv.network == 'rinkeby') { provider = new HDWalletProvider(privKey, 'https://rinkeby.infura.io/') } else if (argv.network == 'kovan') {
    provider = new HDWalletProvider(privKey, 'https://kovan.infura.io/')
  } else if (argv.network == 'mainnet') {
    provider = new HDWalletProvider(privKey, 'https://mainnet.infura.io/')
  }
  web3 = new Web3(provider.engine)
} else {
  web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
}

const TruffleContract = require('truffle-contract')

// retrieve truffle-contracts
const ProxyJson = JSON.parse(fs.readFileSync('./build/contracts/Proxy.json'))
const Proxy = TruffleContract(ProxyJson)
const DutchExchangeJson = JSON.parse(fs.readFileSync('./build/contracts/DutchExchange.json'))
const DutchExchange = TruffleContract(DutchExchangeJson)

// only for
const EtherTokenJson = JSON.parse(fs.readFileSync('./build/contracts/EtherToken.json'))
const EtherToken = TruffleContract(EtherTokenJson)
const TokenOMGJson = JSON.parse(fs.readFileSync('./build/contracts/TokenOMG.json'))
const TokenOMG = TruffleContract(TokenOMGJson)
const TokenRDNJson = JSON.parse(fs.readFileSync('./build/contracts/TokenRDN.json'))
const TokenRDN = TruffleContract(TokenRDNJson)
EtherToken.setProvider(web3.currentProvider)
TokenOMG.setProvider(web3.currentProvider)
TokenRDN.setProvider(web3.currentProvider)
DutchExchange.setProvider(web3.currentProvider)
Proxy.setProvider(web3.currentProvider)

const approveToken = async tokenAddresses => {
  let dx
  try {
    const acct = await promisedAcct
    const proxy = await Proxy.deployed()
    const dx = DutchExchange.at(proxy.address)
    console.log(acct)
    console.log(await dx.auctioneer())
    console.log(tokenAddresses)
    await dx.updateApprovalOfToken(tokenAddresses, true, {from: acct, gas: 1950546})
    console.log(`
    ===========================
    Successfully approved the Token  => [${tokenAddresses}] 
    New approval status of Token  => [${await dx.approvedTokens.call(tokenAddresses[0])}] 
    `)
    return
  } catch (error) {
    throw new Error('Tokens,' + tokenAddresses[0] + 'could not be approved' + error)
  }
}

const promisedAcct = new Promise((resolve, reject) => web3.eth.getAccounts((e, r) => a(r[0])))

module.exports = (async () => {
  // reading the top 150 tokens address and approve them
  // reading from listOfTOP159TOkenaddresses
  data = await fs.readFileSync('./scripts/listOfTOP150TokenAddresses.txt', 'utf8', function (err, data) {
		  if (err) {
		    return console.log(err)
		  }
  })
  tokenAddresses = data.split(',')
  var result = []
  tokenAddresses.forEach(function (item) {
     		if (result.indexOf(item) < 0) {
        	 result.push(item)
     		}
  })
  tokenAddresses = result
  console.log(tokenAddresses.length)

  // approving addresses in junks of size
  const size = 50
  for (i = 0; i < tokenAddresses.length / size; i++) {
    console.log((i + 1) * size)
    const fiveAddresses = tokenAddresses.slice((i) * size, (i + 1) * size)
    await approveToken(fiveAddresses)
  }

  if (argv.network == 'mainnet') {
    // nothing additional to the 150 top tokens
  }

  if (argv.network == 'rinkeby') {
    const eth = await EtherToken.deployed()
    const omg = await TokenOMG.deployed()
    const rdn = await TokenRDN.deployed()
    tokenAddresses = [eth.address, rdn.address, omg.address]
    await approveToken(tokenAddresses)
  }
  process.exit(0)
})()

// code to generate the list for the first time.
/*
	// reading top 150 token
	data = await fs.readFileSync('./scripts/listOfTOP150TokensByMarketCap.txt', 'utf8', function (err,data) {
	  if (err) {
	    return console.log(err);
	  }
	});

	// getting the Tokens within ()
	data = (data.match(/\(.+?\)/g)     // Use regex to get matches
	  || []                  // Use empty array if there are no matches
		).map(function(str) {    // Iterate matches
	  	return str.slice(1,-1) // Remove the brackets
		})

	console.log(data)
	// getting tokenAddresses from
	readFiles('./../tokens/tokens/eth/', function( content) {
		addresses = content
		console.log(addresses)
		data = data.map(x => getAddressFromName(x, addresses))
		tokenAddresses = data.filter(
		function(x){ return x.length == 42 }
		)

		//Adding EtherToken as well
		tokenAddresses.push('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		console.log(tokenAddresses)
		fs.writeFile("./scripts/listOfTOP150TokenAddresses.txt", tokenAddresses, function(err) {
    		if(err) {
        	return console.log(err);
    	}

    		console.log("The file was saved!");
		});
		}, function(err) {
  		throw err;
	}) */
