pragma solidity ^0.4.24;

import "./TestToken.sol";

contract TokenMKR is TestToken {
    constructor (uint amount) public
      TestToken ("testMKR", "Test MKR", 18, amount) {
    }
}
