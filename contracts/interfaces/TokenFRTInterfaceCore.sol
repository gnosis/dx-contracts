pragma solidity ^0.4.24;

interface TokenFRTInterfaceCore {
    function updateMinter(address _minter) external;
    function updateOwner(address owner) external;
    function mintTokens(address user, uint amount) external;
    function lockTokens(uint amount) external returns (uint totalAmountLocked);
    function unlockTokens() external returns (uint totalAmountUnlocked, uint withdrawalTime);
    function withdrawUnlockedTokens() external;
}
