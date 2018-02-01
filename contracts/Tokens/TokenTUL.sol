pragma solidity ^0.4.19;
import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/StandardToken.sol";
import "../Utils/Math2.sol";


/// @title Standard token contract with overflow protection
contract TokenTUL is StandardToken {
    using Math2 for *;

    struct unlockedTUL {
        uint amountUnlocked;
        uint withdrawalTime;
    }

    /*
     *  Storage
     */

    address public owner;
    address public minter;

    // user => unlockedTUL
    mapping (address => unlockedTUL) public unlockedTULs;

    // user => amount
    mapping (address => uint) public lockedTULBalances;

    /*
     *  Public functions
     */

    function TokenTUL(
        address _owner,
        address _minter
    )
        public
    {
        owner = _owner;
        minter = _minter;
    }

    function updateOwner(
        address _owner
    )
        public
    {
        require(msg.sender == owner);
        owner = _owner;
    }

    function updateMinter(
        address _minter
    )
        public
    {
        require(msg.sender == owner);
        minter = _minter;
    }

    function mintTokens(
        address user,
        uint amount
    )
        public
    {
        require(msg.sender == minter);

        lockedTULBalances[user] += amount;
        totalTokens += amount;
    }

    /// @dev Lock TUL
    function lockTokens(
        uint amount
    )
        public
        returns (uint totalAmountLocked)
    {
        // Adjust amount by balance
        amount = Math2.min(amount, balances[msg.sender]);
        
        // Update state variables
        balances[msg.sender] -= amount;
        lockedTULBalances[msg.sender] += amount;

        // Get return variable
        totalAmountLocked = lockedTULBalances[msg.sender];
    }

    function unlockTokens(
        uint amount
    )
        public
        returns (uint totalAmountUnlocked, uint withdrawalTime)
    {
        // Adjust amount by locked balances
        amount = Math2.min(amount, lockedTULBalances[msg.sender]);

        if (amount > 0) {
            // Update state variables
            lockedTULBalances[msg.sender] -= amount;
            unlockedTULs[msg.sender].amountUnlocked += amount;
            unlockedTULs[msg.sender].withdrawalTime = now + 24 hours;
        }

        // Get return variables
        totalAmountUnlocked = unlockedTULs[msg.sender].amountUnlocked;
        withdrawalTime = unlockedTULs[msg.sender].withdrawalTime;
    }

    function withdrawUnlockedTokens()
    public
    {
        require(unlockedTULs[msg.sender].withdrawalTime < now);
        balances[msg.sender] += unlockedTULs[msg.sender].amountUnlocked;
        unlockedTULs[msg.sender].amountUnlocked = 0;
    }
}
