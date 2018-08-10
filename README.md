[![Build Status](https://travis-ci.org/gnosis/dx-contracts.svg?branch=master)](https://travis-ci.org/gnosis/dx-contracts?branch=master)
[![npm version](https://badge.fury.io/js/%40gnosis.pm%2Fdx-contracts.svg)](https://badge.fury.io/js/%40gnosis.pm%2Fdx-contracts)

<p align="center">
  <img width="350px" src="http://dutchx.readthedocs.io/en/latest/_static/DutchX-logo_blue.svg" />
</p>

<p align="center">
  <a href="./docs/Solidified_Audit_Report.pdf">
  <img width="75px" src="http://dutchx.readthedocs.io/en/latest/_static/Sol_Badge_SlateOnTrans@2x.png" />
  </a>
</p>

# DutchX - Smart Contracts

The **Dutch Exchange (DutchX)** is a fully decentralized exchange, which
allows **everyone** to add any trading token pair.

It uses the [Dutch auction] principle, to prevent the problems that
other exchanges are experiencing (such as front running) getting a
fairer ecosystem for everyone to use.

There is no restriction besides the fact that tokens must be
[ERC20][Dutch auction] compliant.

# Documentation
Checkout the [DutchX Documentation](http://dutchx.readthedocs.io/en/latest).

# Contract addresses
Check out the addresses for the deployed contracts in `rinkeby` and `mainnet` in
:
  * [Documentation > Smart Contracts Addresses](http://dutchx.readthedocs.io/en/latest/smart-contracts_addresses.html)

# Development
For developer we recommend to read the documentation and guides in
[DutchX Documentation](http://dutchx.readthedocs.io/en/latest).

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
The migration that setup the DutchX contract is parametrized, so you can
change the default value of the thresholds:
* `THRESHOLD_NEW_TOKEN_PAIR_USD`: Minimum USD worth of a token that the contract
requires in order to add a new token pair in the DutchX. It's `10.000 USD` by
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
# Migrate the version to the testnets, at least rinkeby, and possibly mainnet
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
This Program (as defined by the [GNU Lesser General Public License](./LICENSE.md)) is made available on
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
