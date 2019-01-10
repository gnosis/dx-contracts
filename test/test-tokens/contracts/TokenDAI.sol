pragma solidity ^0.5.0;

import "./TestToken.sol";

contract TokenDAI is TestToken {
    constructor(uint amount) public TestToken("testDAI", "Test DAI", 18, amount) {}
}
