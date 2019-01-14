pragma solidity ^0.4.24;

interface TokenFRTInterface {
    function updateMinter(address _minter) external;
    function updateOwner(address owner) external;
    function mintTokens(address user, uint amount) external;
    function lockTokens(uint amount) external returns (uint totalAmountLocked);
    function unlockTokens() external returns (uint totalAmountUnlocked, uint withdrawalTime);
    function withdrawUnlockedTokens() external;
    
    function min(uint a, uint b) external pure returns (uint);
    function safeToAdd(uint a, uint b) external pure returns (bool);
    function safeToSub(uint a, uint b) external pure returns (bool);
    function add(uint a, uint b) external pure returns (uint);
    function sub(uint a, uint b) external pure returns (uint);
}
