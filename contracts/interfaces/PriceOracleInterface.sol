pragma solidity ^0.4.24;

interface PriceOracleInterface {
    function getUSDETHPrice() external returns (uint256);
}
