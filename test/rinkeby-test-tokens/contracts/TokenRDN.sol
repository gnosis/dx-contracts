pragma solidity ^0.4.21;

import "./TestToken.sol";

contract TokenRDN is TestToken {
    function TokenRDN (uint amount) public
      TestToken ("RDN", "Raiden", 18, amount) {
    }
}
