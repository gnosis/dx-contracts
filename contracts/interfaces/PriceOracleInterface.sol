pragma solidity ^0.5.2;

interface PriceOracleInterface {
    function getUSDETHPrice() external view returns (uint256);
}
