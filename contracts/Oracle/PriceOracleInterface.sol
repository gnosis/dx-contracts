pragma solidity ^0.4.19;

/*
This contract is the interface between the MakerDAO priceFeed and our DX platform.
*/

import "../Oracle/PriceFeed.sol";
import "../Oracle/Medianizer.sol";

contract PriceOracleInterface {

    address public priceFeedSource;
    address public owner;
    
    event NonValidPriceFeed(address priceFeedSource);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /// @dev constructor of the contract
    /// @param _owner address of owner
    /// @param _priceFeedSource address of price Feed Source -> should be maker feeds
    function PriceOracleInterface(
        address _owner,
        address _priceFeedSource
    )
        public
    {
        owner = _owner;
        priceFeedSource = _priceFeedSource;
    }
   
    /// @dev updates the priceFeedSource
    /// @param _priceFeedSource address of price Feed Source -> should be maker feeds
    function updatePriceFeedSource(
        address _priceFeedSource
    )
        public
        onlyOwner()
    {
        priceFeedSource = _priceFeedSource;
    }

    /// @dev updates the priceFeedSource
    /// @param _owner address of owner
    function updateCurator(
        address _owner
    )
        public
        onlyOwner()
    {
        owner = _owner;
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
        return uint256(price)/(1 ether);
    }  
}
