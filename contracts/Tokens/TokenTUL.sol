pragma solidity 0.4.18;
import "../Tokens/StandardToken.sol";
import "../Utils/Math.sol";


/// @title Standard token contract with overflow protection
contract TokenTUL is StandardToken {
    using Math for *;

    /*
     *  Storage
     */


    struct unlockedTUL {
        uint amout;
        uint withdrawalTime;
    }
    address owner;
    address dutchExchange;

    // user => unlockedTUL
    mapping (address => unlockedTUL) public unlockedTULs;
    // user => amount
    mapping (address => uint) public lockedTULBalances;
    /*
     * Modifiers
     */
     modifier onlyOwner() {
     	require(msg.sender == owner);
     	_;
     }

     modifier onlyExchange() {
        require(msg.sender == dutchExchange);
        _;
     }
    /*
     *  Public functions
     */

    function TokenTUL(
     	address _owner
 	)
 		public
 	{
 		owner = _owner;
        totalTokens=1;
 	}

 	function updateOwner(
 		address _owner
	)
		public
		onlyOwner()
	{
		owner = _owner;
	}

    function updateExchange(
        address _exchange
    )
        public
        onlyOwner()
    {
        dutchExchange = _exchange;
    }
    
    function mintTokens(
     	uint amount
 	)
    	public
    	onlyExchange()
    {
    	balances[owner] += amount;
    	totalTokens += amount;
    }

    /// @dev Lock TUL
    function lockTUL()
        public
    {
        //TObe goded
        // Transfer maximum number
        //allowances(msg.sender, this);
        //balances[msg.sender]-=;

        //lockedTULBalances[msg.sender] += allowance;
    }

    function unlockTUL(
        uint amount
    )
        public
    {
        //Tobecoded
        //amount = Math.min(amount, lockedTULBalances[msg.sender]);
        //lockedTULBalances[msg.sender] -= amount;
        //unlockedTULs[msg.sender].amount += amount;
        //unlockedTULs[msg.sender].withdrawalTime = now + 24 hours;
    }
    function getLockedAmount(
        address owner
    ) 
        public 
        returns (uint){
            //Tobecoded
        return 0;
    }
}
