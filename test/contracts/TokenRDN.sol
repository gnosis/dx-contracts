pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/StandardToken.sol";

contract TokenRDN is StandardToken {
    string public constant symbol = "RDN";
    string public constant name = "Raiden network tokens";
    uint8 public constant decimals = 18;

    function TokenRDN(
    	uint amount
    )
    	public 
    {
    	balances[msg.sender] = amount;
    }
}
