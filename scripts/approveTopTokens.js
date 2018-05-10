function getAddressFromName(code, addresses) {
  allAddresses = addresses.filter(
      function(addresses){ return addresses.symbol == code }
  );
  if(allAddresses.length != 1){
  	console.log("could not find unique address for "+code)
	return '';
	}
return allAddresses[0].address;
}
var fs = require('fs');

function readFiles(dirname, onFileContent, onError) {
  fs.readdir(dirname, function(err, filenames) {
    if (err) {
      onError(err);
      return;
    }
    d = []
    filenames.forEach(function(filename) {
      d.push(JSON.parse(fs.readFileSync(dirname + filename, 'utf-8'))) 
    });
  	onFileContent(d)
  });
}
/**
 * node scritps/approveTokenForDutchX.js
 * to add a new TradingPair ETH:Token to the DutchExchange
 * @flags:
 * --network                    if not specified, testrpc will be used. Otherwise rinkeby             
 */

const Web3 = require('web3')
fs = require('fs');
const argv = require('minimist')(process.argv.slice(2), { string: 'a', string: ['network']})

const privKey = process.env.PrivateKEY // raw private key
const HDWalletProvider = require("truffle-hdwallet-provider-privkey");

let web3, provider
if (argv.network) {
  if(argv.network == 'rinkeby')
    provider = new HDWalletProvider(privKey, 'https://rinkeby.infura.io/')
  else if(argv.network == 'kovan'){
    provider = new HDWalletProvider(privKey, 'https://kovan.infura.io/')
  }
  else if(argv.network == 'mainnet'){
    provider = new HDWalletProvider(privKey, 'https://mainet.infura.io/')
  }
  web3 = new Web3(provider.engine)
} else {
  web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
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

const approveToken = async (tokenAddress) => {
  let dx
  try {
    const acct = await promisedAcct
    const proxy = await Proxy.deployed()
    const dx = DutchExchange.at(proxy.address)
    await dx.updateApprovalOfToken(tokenAddress, true,{from: acct})
    console.log(`
    ===========================
    Successfully approved the Token  => [${tokenAddress}] 
    New approval status of Token  => [${await dx.approvedTokens.call(tokenAddress)}] 
    `)
    return
  } catch (error) {
    throw new Error("Token"+ tokenAddress + "could not be approved" + error)
  }
}


const promisedAcct = new Promise((a, r) => web3.eth.getAccounts((e, r) => a(r[0])))

module.exports = (async () => {

	if(argv.network == 'rinkeby'){
	// reading top 100 token
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

	// getting tokenAddresses from 
	var aa = {}
	var fruits = ["Banana", "Orange", "Apple", "Mango"];

	readFiles('./../tokens/tokens/eth/', function( content) {
		addresses = content
		console.log(addresses)
		data = data.map(x => getAddressFromName(x, addresses))
		tokenAddresses = data.filter(      
		function(x){ return x.length == 42 }
		)

		//Adding EtherToken as well
		tokenAddresses.push('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
		await Promise.all(tokenAddresses.map((address) => {
    	
    	approveToken(address)
		}))
		}, function(err) {
  		throw err;
	})

/*

	addresses = JSON.parse(fs.readFileSync('./scripts/tokenAddresses.json', 'utf8', function (err,data) {
	  if (err) {
	    return console.log(err);
	  }
	})) 	
	data = data.map(x => getAddressFromName(x, addresses))


	tokenAddresses = data.filter(      
		function(x){ return x.length == 42 }
		)
	await Promise.all(tokenAddresses.map((address) => {
    	
    	approveToken(address)
	}))
	*/
	}

	if(argv.network == 'rrinkeby'){
	// reading top 100 token
	const eth =await EtherToken.deployed()
	const omg =await TokenOMG.deployed()
	const rdn =await TokenRDN.deployed()
	tokenAddresses = [eth.address, rdn.address, omg.address]
	await Promise.all(tokenAddresses.map((address) => {
    	/* eslint array-callback-return:0 */
    	approveToken(address)
	}))
	}

})()

