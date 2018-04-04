pragma solidity ^0.4.19;
import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/StandardToken.sol";


/// @title Standard token contract with overflow protection
contract TokenMGN is StandardToken {
   using Math for *;

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

        lockedTokenBalances[user] = lockedTokenBalances[user].add(amount);
        totalTokens = totalTokens.add(amount);
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
        balances[msg.sender] = balances[msg.sender].sub(amount);
        lockedTokenBalances[msg.sender] = lockedTokenBalances[msg.sender].add(amount);

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
            lockedTokenBalances[msg.sender] = lockedTokenBalances[msg.sender].sub(amount);
            unlockedTokens[msg.sender].amountUnlocked =  unlockedTokens[msg.sender].amountUnlocked.add(amount);
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
        balances[msg.sender] = balances[msg.sender].add(unlockedTokens[msg.sender].amountUnlocked);
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
