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

Trusted for the following:

* `mintTokens` for `TokenFRT` (Magnolia)
* `burnOWL` for `TokenOWL`
* By users to keep custody of their token `balances`

Places trust in the following:

* caller of `setupDutchExchange` for setting `thresholdNewTokenPair` and `thresholdNewAuction` (this can only happen once)
* `ethUSDOracle` (an instance of `EthOracle`) for `getUSDETHPrice`
  - `owner` (curator? see `updateCurator`) of the `ethUSDOracle` for `raiseEmergency`
* `auctioneer` for:
  - Code updates with time buffer (implemented by `DxUpgrade`)
  - Managing the token whitelist `approvedTokens` (implemented by `TokenWhitelist`)
  - Determining and maintaining the `thresholdNewTokenPair`
  - Determining and maintaining the `thresholdNewAuction`
* Whitelisted tokens `approvedTokens` for:
  - Being sane enough to have trading volume between pairs of these tokens generate `TokenFRT`
* W-ETH for being liquid against token pairs that would trade against it, i.e. reference on-chain
* US Dollars for reference off-chain

Nitpicks:

* `ethTokenMem` is actually on the stack
* `require(auctionStart != AUCTION_START_WAITING_FOR_FUNDING);` for sentinel value checks

Minor:

* `DxMath` is unnecessary, and adds additional bytecode/possible calls to the runtime. Recommend removing this as a parent and using a library with `internal` function calls instead.
* `latestAuctionIndices` should be `internal` due to more useful getter already implemented.

Note:

* There are two accounts with special powers: `owner` and `auctioneer`. In practice, both of these refer to the same account IIRC (planned to be handed over to DxDAO).

`getPriceInPastAuction` LGTM.

`getPriceOfTokenInLastAuction` LGTM.

`setAuctionStart` LGTM.

`addTokenPair` (and associated `calculateFundedValueTokenToken` and `addTokenPairSecondPart`) LGTM.

`deposit`/`withdraw` LGTM.

`settleFee` (and `settleFeeSecondPart` and `getFeeRatio`) LGTM.

`closeTheoreticalClosedAuction`
* Closes a running auction if the time is right(?) by doing a `postBuyOrder` with 0. This seems sort of kludgey to me... Why not just call `clearAuction`? I don't think there is a security with doing it one way or another... am I missing something?

`postBuyOrder`:
* Last trade is fee-less? See: `else { amount = outstandingVolume; amountAfterFee = outstandingVolume; }`

`postSellOrder` LGTM

`claimSellerFunds`/`claimBuyerFunds` (and `getUnclaimedBuyerFunds`):
* Potentially may get locked out by TokenFRT over-minting FRT if somehow DutchExchange gets tricked into thinking 10^12 ETH is regularly being transacted by a user??? Okay maybe by then there are already bigger problems. Besides `getPriceOfTokenInLastAuction` LGTM
* `DxMath.atleastZero(int(DxMath.mul(buyerBalance, den) / num - claimedAmounts[sellToken][buyToken][auctionIndex][user]));` happens to work because two's complement representation means EVM uses same opcode for signed and unsigned addition/subtraction, though the cast happens after an underflow would ;)


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
