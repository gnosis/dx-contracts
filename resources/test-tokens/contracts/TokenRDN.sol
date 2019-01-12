pragma solidity ^0.4.24;

import "./TestToken.sol";

contract TokenRDN is TestToken {
    constructor (uint amount) public
      TestToken ("RDN", "Raiden", 18, amount) {
    }
}
