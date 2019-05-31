pragma solidity ^0.5.2;

import "./TestToken.sol";

contract TokenCVC is TestToken {
    constructor(uint amount) public TestToken("CVC", "Civic", 8, amount) {}
}
