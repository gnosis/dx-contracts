pragma solidity ^0.4.21;

import "./TestToken.sol";

contract TokenGEN is TestToken {
    function TokenGEN (uint amount) public
      TestToken ("testGEN", "Test GEN", 18, amount) {
    }
}
