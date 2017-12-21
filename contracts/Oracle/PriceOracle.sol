pragma solidity ^0.4.18;

import "./../DutchExchange/DutchExchangeInterface.sol";
import "./../Utils/Math.sol";

contract PriceOracle {
    //using Math for *;

    mapping (address => uint)lastPrices;
    uint public lastPriceETHUSD = 0;
    DutchExchangeInterface dutchExchange;
    address public etherToken;
    address public owner2=0x0;
    address public owner=0x0;
    

     // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    ///@dev constructor of the contract, 
    function PriceOracle(address _owner, address _etherToken)
        public
    {
        owner = _owner;
        etherToken = _etherToken;
    }
   
    function updateDutchExchange(DutchExchangeInterface _dutchExchange)
        public
        onlyOwner()
    {
        dutchExchange = _dutchExchange;
    }

    /// @dev returns the USDETH price in Cents, ie current value would be 45034 == 450 USD and 34 Cents
    function getUSDETHPrice() 
        public
        view
        returns (uint)
    {
        return lastPriceETHUSD;
    }

    /// @dev anyone can trigger the Update process for the USD ETH feed. 
    ///  possible solutions could be realityCheck with a big 
    ///  set of arbitrators: realityKey, Gnosis, Consensus, oralize or chainlink request
    function updateETHUSDPrice() 
        public
    {
            // lastPricesETHUSD = calculatePricesFromOracles();    
    }
    
    function getTokensValueInCENTS(
        address tokenAddress,
        uint amount
    ) 
        public 
        view
        returns (uint)
    {
        uint tokenValueInETH=getTokensValueInETH(tokenAddress, amount);
        return tokenValueInETH*lastPriceETHUSD;
    }

    function getTokensValueInETH(
        address tokenAddress,
        uint amount
    ) 
        public 
        view
        returns (uint)
    {
        uint startIndex = dutchExchange.getLatestAuctionIndex(etherToken, tokenAddress);
        require(startIndex > 1);
        if (dutchExchange.getClosingPriceDen(etherToken, tokenAddress, startIndex) == 0) startIndex--;
        return amount * dutchExchange.getClosingPriceNum(etherToken, tokenAddress, startIndex) / dutchExchange.getClosingPriceDen(etherToken,tokenAddress,startIndex);
        //weighted volume from opposite auction would be better, but more expensive
    }

    function getTokensValueInETHwithMinVolume(address tokenAddress, uint amount, uint minVolumeInETH) 
    public 
    view
    returns (uint)
    {
        uint startIndex = dutchExchange.getLatestAuctionIndex(etherToken, tokenAddress);
        require(startIndex > 1);
        if (dutchExchange.getClosingPriceDen(etherToken, tokenAddress, startIndex) == 0) startIndex--;
        uint value=0;
        uint sumOfVolumes=0;
        uint nrOfAuctions=0;
        while (minVolumeInETH > sumOfVolumes && startIndex > 0) {
            value += amount * dutchExchange.getClosingPriceNum(etherToken, tokenAddress, startIndex) / dutchExchange.getClosingPriceDen(etherToken,tokenAddress,startIndex);
            startIndex--;
            nrOfAuctions++;
        }
        return value / nrOfAuctions;
        //weighted volume from opposite auction would be better, but more expensive
    }

    function getTokensValueInToken(address token1, address token2, uint amount1, uint amount2) 
    public 
    view
    returns (uint)
    {
        return getTokensValueInETH(token1, amount1) / getTokensValueInETH(token2, amount2);
    }

    function getCurrentDutchExchange() public view returns(address){
        return address(dutchExchange);
    }
}
