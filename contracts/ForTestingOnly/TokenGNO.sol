pragma solidity ^0.4.21;

import "./SubStandardToken.sol";

contract BadGNO is SubStandardToken {
    string public constant symbol = "GNO";
    string public constant name = "Gnosis";
    uint8 public constant decimals = 18;

    function BadGNO(
    	uint amount
    )
    	public 
    {
        totalTokens = amount;
    	balances[msg.sender] = amount;
    }
}
