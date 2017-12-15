pragma solidity ^0.4.18;

import "./StandardToken.sol";
import "./../Utils/Math.sol";
import "./../Oracle/PriceOracle.sol";


contract OWL is StandardToken {
    using Math for *;


    string public constant name = "OWL-Token";
    string public constant symbol = "OWL";
    uint8 public constant decimals = 18;  // 18 is the most common number of decimal places

    address public GNOTokenAddress;

    address public oracleContract;


    struct GNOLocker {
        address sender;
        uint nonce;
        uint GNOLocked;
        uint timeOfLocking;
        uint lockingPeriod;
        uint GNOIssueRate;
        uint timeOfLastWithdraw;
    }

    mapping ( bytes32 => GNOLocker ) public lockedGNO;
    uint public amountOfGNOLocked;                
    //tracks the amount of GNO currently locked down. Is used in calcIssueRate
    uint public amountOfGNOLockedInitially;       
    //tracks the intial virtual amount of GNO locked down to ensure a smooth issueRate, when first locking is enabled
    
    //@dev: Constructor of the contract OWL, which sets variables and constructs FeeDutchAuction
    //@param: _GNOTokenAddress address of the GNO ERC20 tokens
    //@param: _oracleContract contract where all oracle feeds can be read out
    function OWL(
        address _GNOTokenAddress
        ,address _oracle
    )
        public
    {
        GNOTokenAddress = _GNOTokenAddress;

        oracleContract = _oracle;
        //Tokens credited for Airdrop
        balances[msg.sender] = 1000000000000;
    }
    
    //@dev: Allows GNO holders to lock GNO for OWL
    //@param: amount of GNOs to be locked
    //@param: nonce can be used to manage different GNO locks wth the same address
    //@param: lockingPeriod
    function lockGNO(uint amount, uint nonce, uint lockingPeriod) public
    {
        bytes32 GNOLockHash = keccak256(amount, nonce, lockingPeriod);
        require(lockedGNO[GNOLockHash].timeOfLocking != 0);
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

        lockedGNO[GNOLockHash] = GNOLocker(
            msg.sender,
            nonce,
            amount,
            now-(now%(1 days)),  // further OWL issuance is calculated in 5184000 sec[1 (1 days)] steps
            lockingPeriod,
            issueRate*2/3,
            now-(now%(1 days)));
    }

    //@dev: Allows GNO holders with locked GNO to unlock their GNO
    //@param: _GNOLockHash of their Locked GNO
    function unlockGNO(bytes32 _GNOLockHash) public 
    {
        require(lockedGNO[_GNOLockHash].sender == msg.sender);
        require(lockedGNO[_GNOLockHash].timeOfLocking + lockedGNO[_GNOLockHash].lockingPeriod < now);

        withdrawOWL(_GNOLockHash);
        uint amount = lockedGNO[_GNOLockHash].GNOLocked;
        amountOfGNOLocked -= amount;
        delete lockedGNO[_GNOLockHash];

        Token(GNOTokenAddress).transfer(msg.sender, amount);
    }

    //@dev: Allows GNO holders with locked GNO to withdraw OWL
    //@param: _GNOLockHash of their Locked GNO
    function withdrawOWL(bytes32 _lockHash) public
    {
        require(msg.sender == lockedGNO[_lockHash].sender);
        
        balances[msg.sender] += (now-lockedGNO[_lockHash].timeOfLastWithdraw)/((1 days))*lockedGNO[_lockHash].GNOIssueRate;
        lockedGNO[_lockHash].timeOfLastWithdraw = now-(now%(1 days))+(1 days);
    }

    //@dev: Allows GNO holders with locked GNO to relock their GNOTokens
    //@param: _GNOLockHash of their Locked GNO
    //@param: lockingPeriod for the next locking
    function relockGNO(bytes32 _GNOLockHash) public
    {
        require(lockedGNO[_GNOLockHash].sender == msg.sender);
        require(lockedGNO[_GNOLockHash].timeOfLocking + lockedGNO[_GNOLockHash].lockingPeriod < now);
        withdrawOWL(_GNOLockHash);
        lockedGNO[_GNOLockHash].GNOIssueRate = calcIssueRate(lockedGNO[_GNOLockHash].GNOLocked);
        balances[msg.sender] += lockedGNO[_GNOLockHash].GNOIssueRate*lockedGNO[_GNOLockHash].lockingPeriod/3;
        lockedGNO[_GNOLockHash].timeOfLocking = now-(now%(1 days));
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
    /// @param maxAmount of OWL to be burned
    /// @return acutal amount of burned OWL
    function burnOWL(uint maxAmount) public returns (uint) {
        uint amount=Math.min(allowances[msg.sender][this], maxAmount); // Here delegate calls need to be used
        require(balances[msg.sender] >= amount);
        transferFrom(msg.sender, this, amount);
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
        uint b=PriceOracle(oracleContract).getTokensValueInCENTS(GNOTokenAddress,amount) / 100;
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