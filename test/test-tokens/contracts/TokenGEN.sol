pragma solidity ^0.5.0;

import "./TestToken.sol";

contract TokenGEN is TestToken {
    constructor(uint amount) public TestToken("testGEN", "Test GEN", 18, amount) {}
}
