pragma solidity ^0.4.24;

import "./TestToken.sol";

contract TokenKNC is TestToken {
    constructor (uint amount) public
      TestToken ("testKNC", "Test KNC", 18, amount) {
    }
}
