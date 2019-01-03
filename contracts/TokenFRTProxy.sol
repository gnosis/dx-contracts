pragma solidity ^0.4.24;

import "@gnosis.pm/util-contracts/contracts/Proxy.sol";
import "@gnosis.pm/util-contracts/contracts/GnosisStandardToken.sol";

contract TokenFRTProxy is Proxy, GnosisStandardToken {
    ///@dev State variables remain for Block explorer compatibility
    string public constant symbol = "MGN";
    string public constant name = "Magnolia Token";
    uint8 public constant decimals = 18;

    struct unlockedToken {
        uint amountUnlocked;
        uint withdrawalTime;
    }

    /*
     *  Storage
     */
    address public owner;
    address public minter;

    // user => unlockedToken
    mapping (address => unlockedToken) public unlockedTokens;

    // user => amount
    mapping (address => uint) public lockedTokenBalances;

    constructor (
        address proxied,
        address _owner
    )   
        Proxy(proxied)
        public
    {
        require(_owner != address(0));
        owner = _owner;
    }
}