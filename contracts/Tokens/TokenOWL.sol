pragma solidity ^0.4.18;

import "./StandardToken.sol";
import "../Utils/Math.sol";


contract TokenOWL is StandardToken {
    using Math for *;

    string public constant name = "OWL-Token";
    string public constant symbol = "OWL";
    uint8 public constant decimals = 18;  // 18 is the most common number of decimal places

    //@dev: Constructor of the contract OWL, which distributes tokens
    function TokenOWL(
    )
        public
    {
        //Tokens credited for Airdrop
        balances[msg.sender] = 100000000 ether;
    }

    /// @dev To be called from the Prediction markets and DutchX contracts to burn OWL for paying fees.
    /// Depending on the allowance, different amounts will acutally be burned
    /// @param amount of OWL to be burned
    function burnOWL(uint amount) public {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        totalTokens -= amount;
    }
}