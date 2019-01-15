pragma solidity ^0.5.2;

import "./SubStandardToken.sol";

contract BadGNO is SubStandardToken {
    string public constant symbol = "GNO";
    string public constant name = "Gnosis";
    uint8 public constant decimals = 18;

    constructor(uint amount)
    	public 
    {
        totalTokens = amount;
    	balances[msg.sender] = amount;
    }
}
