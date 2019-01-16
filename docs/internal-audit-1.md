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

* `mintTokens` for `TokenFRT` (Magnolia)
* `burnOWL` for `TokenOWL`

Places trust in the following:

* caller of `setupDutchExchange` for setting `thresholdNewTokenPair` and `thresholdNewAuction`
* `ethUSDOracle` (an instance of `EthOracle`) for `getUSDETHPrice`
  - `owner` (curator? see `updateCurator`) of the `ethUSDOracle` for `raiseEmergency`
* `auctioneer` for:
  - Code updates with time buffer (implemented by `DxUpgrade`)
  - Managing the token whitelist (implemented by `TokenWhitelist`)
* Whitelisted tokens to be sane(?)
* US Dollars for reference

Nitpicks:

* `ethTokenMem` is actually on the stack

Minor:

* `DxMath` is unnecessary, and adds additional bytecode/possible calls to the runtime. Recommend removing this as a parent and using a library with `internal` function calls instead.

Note:

* There are two accounts with special powers: `owner` and `auctioneer`. In practice, both of these refer to the same account IIRC. 

### DxUpgrade

Security assumption: users will notice and take appropriate action within `WAITING_PERIOD_CHANGE_MASTERCOPY` (currently 30 days) if the `auctioneer` misbehaves (e.g. attempts to point `DutchExchange` implementation at a buggy/malicious upgrade). Otherwise, LGTM.

### EthOracle

`getUSDETHPrice` returns whole value of `USD/ETH` exchange rate clamped to [$1, $1M]. Will also emit `NonValidPriceFeed` if the `Medianizer` (from Maker) reports that the value returned is invalid, but will continue with the returned value nonetheless. This will happen if an `authority` in the MakerDAO `void`s a value in the feed, but this will not mutate the actual reported value from the feed, so as long as most of the authorities related to the oracle (MakerDAO) are trustworthy, this is fine.

Minor:

* `DxMath` again. See above.

**TODO**: Look more into MakerDAO's implementation.

### DxMath

Should be a library of `internal` functions. See related minor issue under `DutchExchange`. Also, deduplicate this code from `TokenFRT`. Nobody will be asking the DutchX how to safely add two EVM words.

### TokenWhitelist

`auctioneer` manages this whitelist, but basically LGTM.
