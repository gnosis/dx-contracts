pragma solidity ^0.5.2;

import "./TestToken.sol";

contract TokenMKR is TestToken {
    constructor(uint amount) public TestToken("testMKR", "Test MKR", 18, amount) {}
}
