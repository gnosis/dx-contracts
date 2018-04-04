pragma solidity ^0.4.19;
import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/StandardToken.sol";


/// @title Standard token contract with overflow protection
contract TokenMGN is StandardToken {

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

    /*
     *  Public functions
     */

    function TokenMGN(
        address _owner
    )
        public
    {
        require(_owner != address(0));
        owner = _owner;
    }

    // @dev allows to set the minter of Magnolia tokens once.
    // @param   _minter the minter of the Magnolia tokens, should be the DX-proxy
    function updateMinter(
        address _minter
    )
        public
    {
        require(msg.sender == owner);
        require(_minter != address(0));
        //require(minter == address(0));

        minter = _minter;
    }

    function mintTokens(
        address user,
        uint amount
    )
        public
    {
        require(msg.sender == minter);

        lockedTokenBalances[user] += amount;
        totalTokens += amount;
    }

    /// @dev Lock Token
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
        lockedTokenBalances[msg.sender] += amount;

        // Get return variable
        totalAmountLocked = lockedTokenBalances[msg.sender];
    }

    function unlockTokens(
        uint amount
    )
        public
        returns (uint totalAmountUnlocked, uint withdrawalTime)
    {
        // Adjust amount by locked balances
        amount = min(amount, lockedTokenBalances[msg.sender]);

        if (amount > 0) {
            // Update state variables
            lockedTokenBalances[msg.sender] -= amount;
            unlockedTokens[msg.sender].amountUnlocked += amount;
            unlockedTokens[msg.sender].withdrawalTime = now + 24 hours;
        }

        // Get return variables
        totalAmountUnlocked = unlockedTokens[msg.sender].amountUnlocked;
        withdrawalTime = unlockedTokens[msg.sender].withdrawalTime;
    }

    function withdrawUnlockedTokens()
        public
    {
        require(unlockedTokens[msg.sender].withdrawalTime < now);
        balances[msg.sender] += unlockedTokens[msg.sender].amountUnlocked;
        unlockedTokens[msg.sender].amountUnlocked = 0;
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
