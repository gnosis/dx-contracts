pragma solidity ^0.4.18;

import "./StandardToken.sol";

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
