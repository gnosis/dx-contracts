pragma solidity ^0.4.21;
import "@gnosis.pm/util-contracts/contracts/StandardToken.sol";

/// @title Standard token contract with overflow protection
contract TokenFRT is StandardToken {
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

    /*
     *  Public functions
     */

    function TokenFRT(
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

        minter = _minter;
    }

    // @dev the intention is to set the owner as the DX-proxy, once it is deployed
    // Then only an update of the DX-proxy contract after a 30 days delay could change the minter again.
    function updateOwner(   
        address _owner
    )
        public
    {
        require(msg.sender == owner);
        require(_owner != address(0));
        owner = _owner;
    }

    function mintTokens(
        address user,
        uint amount
    )
        public
    {
        require(msg.sender == minter);

        lockedTokenBalances[user] = add(lockedTokenBalances[user], amount);
        totalTokens = add(totalTokens, amount);
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
        balances[msg.sender] = sub(balances[msg.sender], amount);
        lockedTokenBalances[msg.sender] = add(lockedTokenBalances[msg.sender], amount);

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
            lockedTokenBalances[msg.sender] = sub(lockedTokenBalances[msg.sender], amount);
            unlockedTokens[msg.sender].amountUnlocked =  add(unlockedTokens[msg.sender].amountUnlocked, amount);
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
        balances[msg.sender] = add(balances[msg.sender], unlockedTokens[msg.sender].amountUnlocked);
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
        /// @dev Returns whether an add operation causes an overflow
    /// @param a First addend
    /// @param b Second addend
    /// @return Did no overflow occur?
    function safeToAdd(uint a, uint b)
        public
        constant
        returns (bool)
    {
        return a + b >= a;
    }

    /// @dev Returns whether a subtraction operation causes an underflow
    /// @param a Minuend
    /// @param b Subtrahend
    /// @return Did no underflow occur?
    function safeToSub(uint a, uint b)
        public
        constant
        returns (bool)
    {
        return a >= b;
    }


    /// @dev Returns sum if no overflow occurred
    /// @param a First addend
    /// @param b Second addend
    /// @return Sum
    function add(uint a, uint b)
        public
        constant
        returns (uint)
    {
        require(safeToAdd(a, b));
        return a + b;
    }

    /// @dev Returns difference if no overflow occurred
    /// @param a Minuend
    /// @param b Subtrahend
    /// @return Difference
    function sub(uint a, uint b)
        public
        constant
        returns (uint)
    {
        require(safeToSub(a, b));
        return a - b;
    }
}
