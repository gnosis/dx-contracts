pragma solidity ^0.4.21;

import "./TestToken.sol";

contract TokenMKR is TestToken {
    function TokenMKR (uint amount) public
      TestToken ("testMKR", "Test MKR", 18, amount) {
    }
}
