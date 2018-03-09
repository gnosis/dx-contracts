pragma solidity ^0.4.19;
import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/StandardToken.sol";


/// @title Standard token contract with overflow protection
contract TokenMGN is StandardToken {

    struct unlockedMGN {
        uint amountUnlocked;
        uint withdrawalTime;
    }

    /*
     *  Storage
     */

    address public owner;
    address public minter;

    // user => unlockedMGN
    mapping (address => unlockedMGN) public unlockedMGNs;

    // user => amount
    mapping (address => uint) public lockedMGNBalances;

    /*
     *  Public functions
     */

    function TokenMGN(
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

        lockedMGNBalances[user] += amount;
        totalTokens += amount;
    }

    /// @dev Lock MGN
    function lockTokens(
        uint amount
    )
        public
        returns (uint totalAmountLocked)
    {
        // Adjust amount by balance
        amount = min(amount, balances[msg.sender]);
        
        // Update state variables
        balances[msg.sender] -= amount;
        lockedMGNBalances[msg.sender] += amount;

        // Get return variable
        totalAmountLocked = lockedMGNBalances[msg.sender];
    }

    function unlockTokens(
        uint amount
    )
        public
        returns (uint totalAmountUnlocked, uint withdrawalTime)
    {
        // Adjust amount by locked balances
        amount = min(amount, lockedMGNBalances[msg.sender]);

        if (amount > 0) {
            // Update state variables
            lockedMGNBalances[msg.sender] -= amount;
            unlockedMGNs[msg.sender].amountUnlocked += amount;
            unlockedMGNs[msg.sender].withdrawalTime = now + 24 hours;
        }

        // Get return variables
        totalAmountUnlocked = unlockedMGNs[msg.sender].amountUnlocked;
        withdrawalTime = unlockedMGNs[msg.sender].withdrawalTime;
    }

    function withdrawUnlockedTokens()
    public
    {
        require(unlockedMGNs[msg.sender].withdrawalTime < now);
        balances[msg.sender] += unlockedMGNs[msg.sender].amountUnlocked;
        unlockedMGNs[msg.sender].amountUnlocked = 0;
    }

    function min(uint a, uint b) 
        public
        pure
        returns (uint)
    {
        if (a < b) {
            return a;
        } else {
            return b;
        }
    }
}
