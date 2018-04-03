pragma solidity ^0.4.19;

/*
This contract is the interface between the MakerDAO priceFeed and our DX platform.
*/

import "../Oracle/PriceFeed.sol";
import "../Oracle/Medianizer.sol";

contract PriceOracleInterface {

    address public priceFeedSource;
    
    event NonValidPriceFeed(address priceFeedSource);

    /// @dev constructor of the contract
    /// @param _priceFeedSource address of price Feed Source -> should be maker feeds
    function PriceOracleInterface(
        address _priceFeedSource
    )
        public
    {
        priceFeedSource = _priceFeedSource;
    }
   

    /// @dev returns the USDETH price, ie gets the USD price from Maker feed with 18 digits, but last 18 digits are cut off
    function getUSDETHPrice() 
        public
        view
        returns (uint256)
    {
        bytes32 price;
        bool valid=true;
        (price, valid) = Medianizer(priceFeedSource).peek();
        if (!valid) {
            NonValidPriceFeed(priceFeedSource);
        }
        // ensuring that there is no underflow or overflow possible,
        // even if the price is compromised
        uint priceUint = uint256(price)/(1 ether);
        if (priceUint == 0) return 1;
        if (priceUint > 1000000) return 1000000; 
        return priceUint;
    }  
}
