pragma solidity ^0.4.21;

import "../DutchExchange.sol";

contract InternalTests is DutchExchange {
  function settleFeePub(
    address primaryToken,
    address secondaryToken,
    uint auctionIndex,
    address user,
    uint amount
  )
    public
    returns (uint)
  {
    return super.settleFee(primaryToken, secondaryToken, auctionIndex, amount);
  }
  
  function InternalTests(
        TokenFRT _FRT,
        TokenOWL _OWL,
        address _owner, 
        address _ETH,
        PriceOracleInterface _ETHUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
    {
    setupDutchExchange( 
          _FRT,
          _OWL,
          _owner,
          _ETH,
          _ETHUSDOracle,
          _thresholdNewTokenPair,
          _thresholdNewAuction);
    }

  function getFeeRatioForJS(
    address user
  ) public view returns (uint feeRatioNum, uint feeRatioDen)
  {
    (feeRatioNum, feeRatioDen) = super.getFeeRatio(user);
  }

}