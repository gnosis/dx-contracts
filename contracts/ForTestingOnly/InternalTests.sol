pragma solidity ^0.4.19;

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
  ) public view returns (uint, uint)
  {
    fraction memory feeRatio = super.getFeeRatio(user);
    return (feeRatio.num, feeRatio.den);
  }

  function getMasterCopy() public view returns (address) {
    return address(masterCopy);
  }
}