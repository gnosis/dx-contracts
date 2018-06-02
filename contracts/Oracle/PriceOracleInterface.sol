pragma solidity ^0.4.21;

/*
This contract is the interface between the MakerDAO priceFeed and our DX platform.
*/

import "../Oracle/PriceFeed.sol";
import "../Oracle/Medianizer.sol";

contract PriceOracleInterface {

    address public priceFeedSource;
    address public owner;
    bool public emergencyMode;

    event NonValidPriceFeed(address priceFeedSource);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /// @dev constructor of the contract
    /// @param _priceFeedSource address of price Feed Source -> should be maker feeds Medianizer contract
    function PriceOracleInterface(
        address _owner,
        address _priceFeedSource
    )
        public
    {
        owner = _owner;
        priceFeedSource = _priceFeedSource;
    }
    /// @dev gives the owner the possibility to put the Interface into an emergencyMode, which will 
    /// output always a price of 600 USD. This gives everyone time to set up a new pricefeed.
    function raiseEmergency(bool _emergencyMode)
        public
        onlyOwner()
    {
        emergencyMode = _emergencyMode;
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
        returns (uint256)
    {
        // if the contract is in the emergencyMode, because there is an issue with the oracle, we will simply return a price of 600 USD
        if(emergencyMode){
            return 600;
        }

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
