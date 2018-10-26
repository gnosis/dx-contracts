pragma solidity ^0.4.21;

import "./TestToken.sol";

contract TokenDAI is TestToken {
    function TokenDAI (uint amount) public
      TestToken ("testDAI", "Test DAI", 18, amount) {
    }
}
