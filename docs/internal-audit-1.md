## Known issues

* Need a strategy to reduce code size for deploying `DutchExchange` contract

## Weird things

* In order to test, must first compile with `DxDevDependencies.sol`, and then test without that file (e.g. rename it to `.sol~`) or something (???) -- otherwise, stack will overflow while trying to run Emscripten'd solc (soljson.js). I don't have any recommendations to resolve this, other than noting this in the documentation somewhere (has anybody else experienced this?)

## Nitpicks

* Make sure devdocs are aligned with actual code
* Move `test-tokens` out of `test`: doesn't seem to belong there. Also test runner will compile contracts from that directory unnecessarily. Suggest to move `resources` out of `test` and move `test-tokens` into `resources`.

## Pertinent contracts

### DutchExchange

```
DutchExchange
├── DxUpgrade
│   ├── Proxied (internal utils)
│   ├── AuctioneerManaged
│   └── DxMath
├── TokenWhitelist
│   └── AuctioneerManaged
└── EthOracle
    ├── AuctioneerManaged
    └── DxMath
```

Must be authorized for the following:

* `mintTokens` for `TokenFRT`
* `burnOWL` for `TokenOWL`

Places trust in the following:

* caller of `setupDutchExchange` for setting `thresholdNewTokenPair` and `thresholdNewAuction`
* `ethUSDOracle` for `getUSDETHPrice`
* `auctioneer` for **TODO**
* US Dollars for reference

Nitpicks:

* `ethTokenMem` is actually on the stack


### DxUpgrade

### EthOracle

### TokenWhitelist


