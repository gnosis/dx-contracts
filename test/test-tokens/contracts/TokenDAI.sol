pragma solidity ^0.4.24;

import "./TestToken.sol";

contract TokenDAI is TestToken {
    constructor (uint amount) public
      TestToken ("testDAI", "Test DAI", 18, amount) {
    }
}
