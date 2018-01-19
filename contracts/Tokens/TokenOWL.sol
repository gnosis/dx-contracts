pragma solidity ^0.4.18;

import "./StandardToken.sol";
import "../Utils/Math.sol";
import "../Oracle/PriceOracleInterface.sol";


contract TokenOWL is StandardToken {
    using Math for *;


    string public constant name = "OWL-Token";
    string public constant symbol = "OWL";
    uint8 public constant decimals = 18;  // 18 is the most common number of decimal places

    address public GNOTokenAddress;
    address public oracleContract;


    /* Not longer needed due to smart encryption. struct GNOLocker {
        address sender;
        uint nonce;
        uint GNOLocked;
        uint timeOfLocking;
        uint lockingPeriod;
        uint GNOIssueRate;
        uint timeOfLastWithdraw;
    } */

    mapping ( bytes32 => bool ) public lockedGNO;
    uint public amountOfGNOLocked;                
    //tracks the amount of GNO currently locked down. Is used in calcIssueRate
    uint public amountOfGNOLockedInitially;       
    //tracks the intial virtual amount of GNO locked down to ensure a smooth issueRate, when first locking is enabled
    
    //@dev: Constructor of the contract OWL, which sets variables and constructs FeeDutchAuction
    //@param: _GNOTokenAddress address of the GNO ERC20 tokens
    //@param: _oracleContract contract where all oracle feeds can be read out
    function TokenOWL(
        address _GNOTokenAddress
        ,address _oracle
    )
        public
    {
        GNOTokenAddress = _GNOTokenAddress;

        oracleContract = _oracle;
        //Tokens credited for Airdrop
        balances[msg.sender] = 100000000 ether;
    }
    
    //@dev: Allows GNO holders to lock GNO for OWL
    //@param: amount of GNOs to be locked
    //@param: nonce can be used to manage different GNO locks wth the same address
    //@param: lockingPeriod
    function lockGNO(uint amount, uint nonce, uint lockingPeriod) public
    {
       
        require(Token(GNOTokenAddress).transferFrom(msg.sender, this, amount));

        //adjustment of counter of GNOlocked
        if (amountOfGNOLockedInitially > amount) {
            amountOfGNOLockedInitially -= amount;
        } else {
            amountOfGNOLockedInitially = 0;
        }  
        amountOfGNOLocked += amount;

        uint issueRate = calcIssueRate(amount);
        //one thrid of Tokens is issued immediatly
        balances[msg.sender] += issueRate*lockingPeriod/3;
        totalTokens += issueRate*lockingPeriod/3;
        //bytes32 GNOLockHash = keccak256(sender, nonce, GNOLocked, timeOfLocking, lockingPeriod, NGOIssueRate, timeOfLastWithdraw);
        bytes32 GNOLockHash = keccak256(msg.sender, nonce, amount, now-(now%(1 days)), lockingPeriod, issueRate*2/3, now-(now%(1 days)));
        
        require(lockedGNO[GNOLockHash] != true);
        lockedGNO[GNOLockHash] = true;
    }

    //@dev: Allows GNO holders with locked GNO to unlock their GNO
    //@param: _GNOLockHash of their Locked GNO
    function unlockGNO(
        address sender,
        uint nonce,
        uint GNOLocked,
        uint timeOfLocking,
        uint lockingPeriod,
        uint GNOIssueRate,
        uint timeOfLastWithdraw) public 
    {   
        bytes32 GNOLockHash = keccak256(sender, nonce, GNOLocked, timeOfLocking, lockingPeriod, GNOIssueRate, timeOfLastWithdraw);

        require(lockedGNO[GNOLockHash]);
        require(sender == msg.sender);
        require(timeOfLocking + lockingPeriod < now);

        withdrawOWL(
        sender,
        nonce,
        GNOLocked,
        timeOfLocking,
        lockingPeriod,
        GNOIssueRate,
        timeOfLastWithdraw);
        uint amount = GNOLocked;
        amountOfGNOLocked -= amount;
        delete lockedGNO[GNOLockHash];

        Token(GNOTokenAddress).transfer(msg.sender, amount);
    }

    //@dev: Allows GNO holders with locked GNO to withdraw OWL
    //@param: _GNOLockHash of their Locked GNO
    function withdrawOWL(
        address sender,
        uint nonce,
        uint GNOLocked,
        uint timeOfLocking,
        uint lockingPeriod,
        uint GNOIssueRate,
        uint timeOfLastWithdraw) public
    {
        bytes32 GNOLockHash = keccak256(sender, nonce, GNOLocked, timeOfLocking, lockingPeriod, GNOIssueRate, timeOfLastWithdraw);
         require(lockedGNO[GNOLockHash]);
        require(msg.sender == sender);
        
        balances[msg.sender] += (now-timeOfLastWithdraw)/((1 days))*GNOIssueRate;
        totalTokens +=(now-timeOfLastWithdraw)/((1 days))*GNOIssueRate;
        lockedGNO[GNOLockHash] = false;
        GNOLockHash = keccak256(sender, nonce, GNOLocked, timeOfLocking, lockingPeriod, GNOIssueRate, now-(now%(1 days))+(1 days));
         
        lockedGNO[GNOLockHash] = true;
    }

    //@dev: Allows GNO holders with locked GNO to relock their GNOTokens
    //@param: _GNOLockHash of their Locked GNO
    //@param: lockingPeriod for the next locking
    function relockGNO(
        address sender,
        uint nonce,
        uint GNOLocked,
        uint timeOfLocking,
        uint lockingPeriod,
        uint GNOIssueRate,
        uint timeOfLastWithdraw) public
    {
        bytes32 GNOLockHash = keccak256(sender, nonce, GNOLocked, timeOfLocking, lockingPeriod, GNOIssueRate, timeOfLastWithdraw);
         require(lockedGNO[GNOLockHash]);
        require(sender == msg.sender);
        require(timeOfLocking + lockingPeriod < now);
        
        withdrawOWL(
        sender,
        nonce,
        GNOLocked,
        timeOfLocking,
        lockingPeriod,
        GNOIssueRate,
        timeOfLastWithdraw);
        lockedGNO[GNOLockHash] = false;
        uint GNOIssueRate2 = calcIssueRate(GNOLocked);
        GNOLockHash = keccak256(sender, nonce, GNOLocked, timeOfLocking, lockingPeriod, GNOIssueRate2*2/3, now-(now%(1 days)));
        balances[msg.sender] += GNOIssueRate2*lockingPeriod/3;
        totalTokens += GNOIssueRate2*lockingPeriod/3;
        lockedGNO[GNOLockHash] = true;
    }

    // mapping Last30(1 days)s <-> BurnedOWL
    mapping (uint=>uint) public burnedOWL;
    uint public sumOfOWLBurndedLast30days = 0;
    uint public lastdayOfBurningDocumentation;
    // mapping Last30(1 days)s <-> BurnedGNOValuedInUSD
    mapping (uint=>uint) public burnedGNOValuedInUSD;
    uint public sumOfBurnedGNOValuedInUSDInLast30days;
    uint public lastdayOfBurningDocumentationGNO;

    /// @dev To be called from the Prediction markets and DutchX contracts to burn OWL for paying fees.
    /// Depending on the allowance, different amounts will acutally be burned
    /// @param amount of OWL to be burned
    /// @return acutal amount of burned OWL
    function burnOWL(uint amount) public returns (uint) {
        //uint amount=Math.min(allowances[msg.sender][this], maxAmount); // Here delegate calls need to be used
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        totalTokens -= amount;
        // transferFrom is to expensive.
        //transferFrom(msg.sender, this, amount);
        if ((now/(1 days))%(30) == lastdayOfBurningDocumentation) {
            burnedOWL[(now/((1 days)))%(30)] += amount;
        } else {
            sumOfOWLBurndedLast30days += burnedOWL[(now/(1 days)-1)%30];
            sumOfOWLBurndedLast30days -= burnedOWL[(now/(1 days))%30];
            burnedOWL[(now/(1 days))%30] = amount;
            lastdayOfBurningDocumentation = (now/(1 days))%30;
        }
        return amount;
    }

    //@dev: To be called from the FeeDutchAuction to document the fees collected
    //@param: amount of OWL to be burned
    function burnedGNO(uint amount) public
    {
        require(Token(GNOTokenAddress).transferFrom(msg.sender, this, amount));
        uint b=600;//PriceOracle(oracleContract).getTokensValueInCENTS(GNOTokenAddress, amount) / 100;
        if ((now/(1 days))%30 == lastdayOfBurningDocumentationGNO) {
            burnedGNOValuedInUSD[(now/(1 days))%30] += b;
        } else {
            sumOfBurnedGNOValuedInUSDInLast30days += burnedGNOValuedInUSD[(now/(1 days)-1)%30];
            sumOfBurnedGNOValuedInUSDInLast30days -= burnedGNOValuedInUSD[(now/(1 days))%30];
            burnedGNOValuedInUSD[(now/(1 days))%30] = b;
            lastdayOfBurningDocumentationGNO = (now/(1 days))%30;
        }
    }
    
    // internal functions
    
    //@dev: calculates the issueRate
    function calcIssueRate(uint amount) internal view 
        returns(uint)
    {
        uint issueRate = 0;
        if (sumOfOWLBurndedLast30days < sumOfBurnedGNOValuedInUSDInLast30days*9) {
            issueRate = ((sumOfOWLBurndedLast30days + sumOfBurnedGNOValuedInUSDInLast30days)*20-totalSupply())/30;
        } else if (sumOfOWLBurndedLast30days < sumOfBurnedGNOValuedInUSDInLast30days) { 
            issueRate = ((sumOfOWLBurndedLast30days + sumOfBurnedGNOValuedInUSDInLast30days)*20*9*sumOfBurnedGNOValuedInUSDInLast30days/sumOfOWLBurndedLast30days-totalSupply())/30;
        } else {
            issueRate = ((sumOfOWLBurndedLast30days+sumOfBurnedGNOValuedInUSDInLast30days)*20*9-totalSupply())/30;
        }
        return issueRate*amount/(amountOfGNOLockedInitially+amountOfGNOLocked+amount);
    }

}