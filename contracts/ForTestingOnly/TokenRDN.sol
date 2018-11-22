pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/GnosisStandardToken.sol";

contract TokenRDN is GnosisStandardToken {
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
