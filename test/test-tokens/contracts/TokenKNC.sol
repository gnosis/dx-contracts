pragma solidity ^0.4.21;

import "./TestToken.sol";

contract TokenKNC is TestToken {
    function TokenKNC (uint amount) public
      TestToken ("testKNC", "Test KNC", 18, amount) {
    }
}
