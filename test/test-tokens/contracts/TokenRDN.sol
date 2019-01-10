pragma solidity ^0.5.0;

import "./TestToken.sol";

contract TokenRDN is TestToken {
    constructor(uint amount) public TestToken("RDN", "Raiden", 18, amount) {}
}
