Dutch X
=======

[![Logo](https://raw.githubusercontent.com/gnosis/gnosis-contracts/master/assets/logo.png)](https://gnosis.pm/)

[![Build Status](https://travis-ci.org/gnosis/dutch-exchange.svg)](https://travis-ci.org/gnosis/dutch-exchange?branch=SmartContractAudit1.0)

Collection of smart contracts for the Gnosis DutchX.

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

There is a copy version hosted online at https://drive.google.com/file/d/1OojAb6ogvQKVolkGDNVY1Pu74DbTNET6/view

Auction state-diagram overview:
-------------------------------

There is a copy version hosted online at https://drive.google.com/file/d/1hWHtf2_GnBhtb85Yj7I7Xe3mF6jPe08U/view

PriceOracle
-----------

All variables of the smart contracts are public and can easily be access from other smartcontracts. This allows other smartcontracts to calculate specific prices. But the smartcontracts can also call:
 
### priceOracle(address token)

PriceOracle() gives a good estimate for market price of a token in ETH by averaging the the prices of token:ETH and ETH:token of the last auction with positive trading volumes.

 

Contributors
------------
- Dominik ([dteiml](https://github.com/dteiml))
- David ([W3stside](https://github.com/w3stside))
- Dmitry ([Velenir](https://github.com/Velenir))
- Alexander ([josojo](https://github.com/josojo))
- Stefan ([Georgi87](https://github.com/Georgi87))
- Martin ([koeppelmann](https://github.com/koeppelmann))
