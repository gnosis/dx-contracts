pragma solidity ^0.5.2;

import "./TestToken.sol";

contract TokenRDN is TestToken {
    constructor(uint amount) public TestToken("RDN", "Raiden", 18, amount) {}
}
