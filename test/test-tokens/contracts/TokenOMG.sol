pragma solidity ^0.5.2;

import "./TestToken.sol";

contract TokenOMG is TestToken {
    constructor(uint amount) public TestToken("OMG", "OmiseGO", 18, amount) {}
}
