pragma solidity ^0.4.19;

import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/StandardToken.sol";

contract TokenGNO is StandardToken {
    string public constant symbol = "GNO";
    string public constant name = "Gnosis";
    uint8 public constant decimals = 18;

    function TokenGNO(
    	uint amount
    )
    	public 
    {
    	balances[msg.sender] = amount;
    }
}
