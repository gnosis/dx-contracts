pragma solidity ^0.5.2;

interface Medianizer {
    function peek() public view returns (bytes32, bool);
}
