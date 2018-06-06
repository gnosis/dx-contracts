Dutch X
=======

[![Logo](https://raw.githubusercontent.com/gnosis/gnosis-contracts/master/assets/logo.png)](https://gnosis.pm/)

[![Build Status](https://travis-ci.org/gnosis/dutch-exchange.svg)](https://travis-ci.org/gnosis/dutch-exchange?branch=SmartContractAudit1.0)

Collection of smart contracts for the Gnosis DutchX.


Audit
-----
### Audit Report:

[Audit Report inc. known weaknesses](docs/Solidified_Audit_Report.pdf)


Install
-------
### Install requirements with npm:

```bash
npm install
```

Testing
-------
### Start the TestRPC with bigger funding than usual, which is required for the tests:

```bash
npm run rpc
```
Please install at least node version >=7 for `async/await` for a correct execution

### Run all tests 

```bash
truffle test -s
```
The flag -s runs the tests in a silence mode. Additionally the flag -g can be added to plot the gas costs per test.


Compile and Deploy
------------------
These commands apply to the RPC provider running on port 8545. You may want to have TestRPC running in the background. They are really wrappers around the [corresponding Truffle commands](http://truffleframework.com/docs/advanced/commands).

### Compile all contracts to obtain ABI and bytecode:

```bash
truffle compile --all
```

### Migrate all contracts:

```bash
truffle migrate --network NETWORK-NAME
```

Network Artifacts
-----------------

### Get network artifacts from the networks.json file:

```bash
node scripts/inject_artifacts.js
```

### Extracting current network artifacts into networks.json file:

```bash
node scripts/extract_artifacts.js
```


Documentation
-------------

There is a copy version hosted online at <docs/DutchX_Documentation.pdf>
You may want to download the pdf for external hyperlinks to work.

Auction state-diagram overview:
-------------------------------

There is a copy version hosted online at <docs/StateDiagram.png>

PriceOracle
-----------

All variables of the smart contracts are public and can easily be access from other smartcontracts. This allows other smartcontracts to calculate specific prices. But the smartcontracts can also call:
 
### getPriceInPastAuction(address token1, address token2, uint auctionIndex)

getPriceInPastAuction() gives a good estimate for market price [token1]/[token2] by averaging the the prices of [token1]:[token2] and [token2]:[token1] of the auctions with auctionIndex.
 

Contributors
------------
- Dominik ([dteiml](https://github.com/dteiml))
- David ([W3stside](https://github.com/w3stside))
- Dmitry ([Velenir](https://github.com/Velenir))
- Alexander ([josojo](https://github.com/josojo))
- Stefan ([Georgi87](https://github.com/Georgi87))
- Martin ([koeppelmann](https://github.com/koeppelmann))
