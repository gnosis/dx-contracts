# Dutch X

[![Logo](https://raw.githubusercontent.com/gnosis/gnosis-contracts/master/assets/logo.png)](https://gnosis.pm/)

[![Build Status](https://travis-ci.org/gnosis/dutch-exchange.svg)](https://travis-ci.org/gnosis/dutch-exchange?branch=SmartContractAudit1.0)

Dutch X contracts is a collection of smart contracts for a decentraized exchange 
that uses the dutch auction principle to provide a fare mechanism to exchange 
any ERC20 token pair.

It is a fully decentralized, featuring a price mechanism that starts with a 
high price which falls monotonically.

Eventually, every successful buyer pays the same price once the auction closes, 
ensuring orders don’t have to be cancelled when markets fluctuate. 

While this mechanism eliminates the bottlenecks of decentralized order book 
exchanges, such as front-running and scaling difficulties, it also allows for a 
more streamlined trading experience.

Read more about the Dutch X mechanisms in the 
[Dutch X Documentation](docs/DutchX_Documentation.pdf).

For a introduction to the mechanisms make sure your read:
* [Introducing the Gnosis Dutch Exchange](https://blog.gnosis.pm/introducing-the-gnosis-dutch-exchange-53bd3d51f9b2)
* [The Mechanism Design of the Gnosis Dutch Exchange](https://blog.gnosis.pm/the-mechanism-design-of-the-gnosis-dutch-exchange-4299a045d523)
* [The Main Benefits of the DutchX Mechanism](https://blog.gnosis.pm/the-main-benefits-of-the-dutchx-mechanism-6fc2ef6ee8b4)
* For other articles, check the blog: [https://blog.gnosis.pm/tagged/dutchx]()

For aditional information and for reference, check out the following 
links:

* [Gitter Channel](https://gitter.im/gnosis/DutchX): Participate in the gitter channel.
* [Github: dx-examples-api](https://github.com/gnosis/dx-examples-api): 
Example project and documentation on how to use the Dutch X API.
* [Github: dx-contracts](https://github.com/gnosis/dx-contracts): Smart 
contracts of the Duch X
* [Github: dx-react](https://github.com/gnosis/dx-react): Front end web 
application for the Dutch X seller interface
* [Github: dx-services](https://github.com/gnosis/dx-services): Services, 
repositories and bots to interact with DX.
* [CLI](https://github.com/gnosis/dx-example-cli-rinkeby): Project that provides
a simple example of one way you can interact with the DX from the command line.
* [Liquidity Bots](https://github.com/gnosis/dx-examples-liquidity-bots): 
Project that implements some bots with the goal of watching some token pairs and
ensuring the liquidity for the market.
* [https://github.com/gnosis/dx-examples-api](): Example poject on how to use 
the public API of the Dutch X.
* [Auction state-diagram overview](https://drive.google.com/file/d/1hWHtf2_GnBhtb85Yj7I7Xe3mF6jPe08U/view):
States of the auctions and the transitions between them.

# Security of the contracts
Security is one of the main focus for the Dutch X, so the code was subjected 
to several reviews, audits and bug bunties.

## Audit
The contracts were subjected to a thorough audit, the report can be finded in:
* [Audit Report inc. known weaknesses](docs/Solidified_Audit_Report.pdf)

## Bug bunty
Read Gnosis blog post:
* [Gnosis DutchX and Initial OWL Generation Bug Bounty](https://blog.gnosis.pm/gnosis-dutchx-and-initial-owl-generation-bug-bounty-71ba53dfd2db)

# Get started - Use DX in your project
Add it to your project:

```bash
# Install the dependencies
yarn add truffle-contract @gnosis.pm/dx-contracts --save # or npm install @gnosis.pm/dx-contracts --save
```

You will find the compiled truffle contracts in the `build/contracts` folder,
these contract abstractions will also contain the addresses for the DX for 
**mainnet** and the **testnets**.

For example:
```js
const contract = require('truffle-contract')

// Create the truffle contracts
const DutchExchangeProxy = contract(require('@gnosis.pm/dx-contracts/build/contracts/DutchExchangeProxy'))
const DutchExchange = contract(require('@gnosis.pm/dx-contracts/build/contracts/DutchExchange'))

// Setup your provider
// provider = ...
DutchExchange.setProvider(provider)
DutchExchangeProxy.setProvider(provider)

// Get the contract instance
DutchExchangeProxy.deployed(async proxy => {
  const dx = DutchExchange.at(proxy.address)

  // Use any of the dx methods
  const token1 = '0x123456'
  const token1 = '0x654321'
  const auctionIndex = await dx.getAuctionIndex.call(token1, token2)
  console.log(auctionIndex)
})
```

## Contract addresses
The token and contract can be reviewed in **Etherscan**:

* **Mainnet**:
  * DutchExchange (proxy): [https://etherscan.io/address/0xaf1745c0f8117384dfa5fff40f824057c70f2ed3]()
  * DutchExchange (master): [https://etherscan.io/address/0x039fb002d21c1c5eeb400612aef3d64d49eb0d94]()
  * PriceOracleInterface: [https://etherscan.io/address/0xff29b0b15a0a1da474bc9a132077153c53a2373b]()
  * Medianizer: [https://etherscan.io/address/0x729D19f657BD0614b4985Cf1D82531c67569197B]()
    * [https://developer.makerdao.com/feeds]()
    * [https://makerdao.com/feeds]()
  * TokenFRT: [https://etherscan.io/token/0xb9625381f086e7b8512e4825f6af1117e9c84d43]()
  * TokenOWL (proxy): [https://etherscan.io/token/0x1a5f9352af8af974bfc03399e3767df6370d82e4]()

* **Rinkeby**:
  * DutchExchange (proxy): [https://rinkeby.etherscan.io/address/0x4e69969d9270ff55fc7c5043b074d4e45f795587]()
  * DutchExchange (master): [https://rinkeby.etherscan.io/address/0x9e5e05700045dc70fc42c125d4bd661c798d4ce9]()
  * PriceOracleInterface: [https://rinkeby.etherscan.io/address/0xa6a644ef9da924b3ecea6cbfd137a825d1ff2a91]()
  * Medianizer: [https://rinkeby.etherscan.io/address/0xbfff80b73f081cc159534d922712551c5ed8b3d3]()
    * [https://developer.makerdao.com/feeds]()
    * [https://makerdao.com/feeds]()
  * TokenFRT: [https://rinkeby.etherscan.io/token/0x152af9ad40ccef2060cd14356647ee1773a43437]()
  * TokenOWL (proxy): [https://rinkeby.etherscan.io/token/0xa7d1c04faf998f9161fc9f800a99a809b84cfc9d]()

# Development
## Setup and show the networks
```bash
# Install dependencies
yarn install

# Compile and restore the network addresses
yarn restore

# Show current network addresses
yarn networks
```

## Execute migrations into a local ganache-cli
```bash
# Make sure ganache cli is installed globally
npm install -g ganache-cli

# Run ganache
yarn rpc

# Execute the migrations
yarn migrate
```

## Set the Ether price and Feed expire date for development
Some migrations allow you to specify some parameter so you can change some values
at deploy time:
* `ETH_USD_PRICE`: Allows to set the price of the ETH-USD oracle feed. Just for 
  local ganache-cli. It's `500 USD/ETH` by default.
* `FEED_EXPIRE_PERIOD_DAYS`: Allows to set the expiration date for the feed. 
  It's `365 days` by default

## Set a different threshold for adding a new token and starting a new auction
The migration that setup the Dutch X contract is parametrized, so you can 
change the defalt value of the thresholds:
* `THRESHOLD_NEW_TOKEN_PAIR_USD`: Minimun USD worth of a token that the contract
requires in order to add a new token pair in the Dutch X. It's `10.000 USD` by 
default.
* `THRESHOLD_AUCTION_START_USD`: Liquidity in USD required for the auction to
start. It's `1.000 USD` by default.

## Run all tests 
```bash
yarn test -s
```
The flag -s runs the tests in a silence mode. Additionally the flag -g can be added to plot the gas costs per test.


## Generate a new version
```bash
# In a release branch (i.e. release/vX.Y.X)
# Migrate the version to the testnets, at least rinkeby, and posibly mainnet
# You can optionally change the gas price using the GAS_PRICE_GWEI env variable
yarn restore
MNEMONIC=$MNEMONIC_DX yarn migrate --network rinkeby

# Extract the network file
yarn networks-extract

# Verify the contract in Etherscan
# Folow the steps in "Verify contract"

# Commit the network file
git add network.json
git commit -m 'Update the networks file'

# Generate version using Semantic Version: https://semver.org/
# For example, for a minor version
npm version minor
git push && git push --tags

# Deploy npm package
npm publish --access=public

# Merge tag into develop, to deploy it to production, also merge it into master
git checkout develop
git merge vX.Y.X
```

## Verify contract on Etherscan
Flatten the smart contract:
```bash
npx truffle-flattener contracts/DutchExchangeProxy.sol > build/DutchExchangeProxy-EtherScan.sol
npx truffle-flattener contracts/DutchExchange.sol > build/DutchExchange-EtherScan.sol
npx truffle-flattener contracts/TokenFRT.sol > build/TokenFRT-EtherScan.sol
npx truffle-flattener contracts/Oracle/PriceOracleInterface.sol > build/PriceOracleInterface-EtherScan.sol
```

Go to Etherscan validation page:
* Go to [Verify Contract Code (version 2.0)](https://rinkeby.etherscan.io/verifyContract2?a=)
* Fill the information:
  * Use the flattened contract
  * Set the exact compiler version used for the compilation i.e. `v0.4.24+commit.e67f0147`
  * Optimization: `Yes`
  * For the proxy, you'll need the ABI encoded params, you can get them by running
  the following script (specify the right network).
    * `yarn get-abi-encoded-params --network rinkeby`
* Press validate

# License
This Program (as defined by the GNU General Public License) is made available on
 an as-is basis open source under the GNU General Public License and by doing so
 , no personal data is collected, used, stored, disclosed or secured by the 
 creators. Depending on how you use this Program, you may be required to provide
  and apply an appropriate privacy policy to comply with law.

An API gathers publicly available data from the Ethereum blockchain on the usage
 of this Program.


# Contributors
- Dominik ([dteiml](https://github.com/dteiml))
- David ([W3stside](https://github.com/w3stside))
- Dmitry ([Velenir](https://github.com/Velenir))
- Alexander ([josojo](https://github.com/josojo))
- Stefan ([Georgi87](https://github.com/Georgi87))
- Martin ([koeppelmann](https://github.com/koeppelmann))
- Anxo ([anxolin](https://github.com/anxolin))
- Dani ([dasanra](https://github.com/dasanra))
