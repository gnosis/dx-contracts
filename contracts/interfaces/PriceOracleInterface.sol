pragma solidity ^0.4.24;

interface PriceOracleInterface {
    event NonValidPriceFeed(address priceFeedSource);
    
    function updateCurator(address _owner) external;
    function getUSDETHPrice() external returns (uint256);
}