pragma solidity ^0.4.19;

import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/StandardToken.sol";

contract TokenRND is StandardToken {
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
