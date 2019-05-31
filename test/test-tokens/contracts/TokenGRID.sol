pragma solidity ^0.5.2;

import "./TestToken.sol";

contract TokenGRID is TestToken {
    constructor(uint amount) public TestToken("GRID", "GRID Token", 12, amount) {}
}
