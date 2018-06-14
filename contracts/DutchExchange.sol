pragma solidity ^0.4.21;

import "./TokenFRT.sol";
import "./Oracle/PriceOracleInterface.sol";  
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "@gnosis.pm/util-contracts/contracts/Proxy.sol";


/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Alex Herrmann - <alex@gnosis.pm>
/// @author Dominik Teiml - <dominik@gnosis.pm>

contract DutchExchange is Proxied {

    // The price is a rational number, so we need a concept of a fraction
    struct fraction {
        uint num;
        uint den;
    }

    uint constant WAITING_PERIOD_NEW_TOKEN_PAIR = 6 hours;
    uint constant WAITING_PERIOD_NEW_AUCTION = 10 minutes;
    uint constant WAITING_PERIOD_CHANGE_MASTERCOPY_OR_ORACLE = 30 days;
    uint constant AUCTION_START_WAITING_FOR_FUNDING = 1;

    address public newMasterCopy;
    // Time when new masterCopy is updatabale
    uint public masterCopyCountdown;

    // > Storage
    // auctioneer has the power to manage some variables
    address public auctioneer;
    // Ether ERC-20 token
    address public ethToken;
    // Price Oracle interface 
    PriceOracleInterface public ethUSDOracle;
    // Price Oracle interface proposals during update process
    PriceOracleInterface public newProposalEthUSDOracle;
    uint public oracleInterfaceCountdown;
    // Minimum required sell funding for adding a new token pair, in USD
    uint public thresholdNewTokenPair;
    // Minimum required sell funding for starting antoher auction, in USD
    uint public thresholdNewAuction;
    // Fee reduction token (magnolia, ERC-20 token)
    TokenFRT public frtToken;
    // Token for paying fees
    TokenOWL public owlToken;

    // mapping that stores the tokens, which are approved
    // Token => approved
    // Only tokens approved by auctioneer generate frtToken tokens
    mapping (address => bool) public approvedTokens;

    // For the following two mappings, there is one mapping for each token pair
    // The order which the tokens should be called is smaller, larger
    // These variables should never be called directly! They have getters below
    // Token => Token => index
    mapping (address => mapping (address => uint)) public latestAuctionIndices;
    // Token => Token => time
    mapping (address => mapping (address => uint)) public auctionStarts;

    // Token => Token => auctionIndex => price
    mapping (address => mapping (address => mapping (uint => fraction))) public closingPrices;

    // Token => Token => amount
    mapping (address => mapping (address => uint)) public sellVolumesCurrent;
    // Token => Token => amount
    mapping (address => mapping (address => uint)) public sellVolumesNext;
    // Token => Token => amount
    mapping (address => mapping (address => uint)) public buyVolumes;

    // Token => user => amount
    // balances stores a user's balance in the DutchX
    mapping (address => mapping (address => uint)) public balances;

    // Token => Token => auctionIndex => amount
    mapping (address => mapping (address => mapping (uint => uint))) public extraTokens;

    // Token => Token =>  auctionIndex => user => amount
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public sellerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public buyerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public claimedAmounts;

    // > Modifiers
    modifier onlyAuctioneer() {
        // Only allows auctioneer to proceed
        // R1
        require(msg.sender == auctioneer);
        _;
    }

    /// @dev Constructor-Function creates exchange
    /// @param _frtToken - address of frtToken ERC-20 token
    /// @param _owlToken - address of owlToken ERC-20 token
    /// @param _auctioneer - auctioneer for managing interfaces
    /// @param _ethToken - address of ETH ERC-20 token
    /// @param _ethUSDOracle - address of the oracle contract for fetching feeds
    /// @param _thresholdNewTokenPair - Minimum required sell funding for adding a new token pair, in USD
    function setupDutchExchange(
        TokenFRT _frtToken,
        TokenOWL _owlToken,
        address _auctioneer, 
        address _ethToken,
        PriceOracleInterface _ethUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
        public
    {
        // Make sure contract hasn't been initialised
        require(ethToken == 0);

        // Validates inputs
        require(address(_owlToken) != address(0));
        require(address(_frtToken) != address(0));
        require(_auctioneer != 0);
        require(_ethToken != 0);
        require(address(_ethUSDOracle) != address(0));

        frtToken = _frtToken;
        owlToken = _owlToken;
        auctioneer = _auctioneer;
        ethToken = _ethToken;
        ethUSDOracle = _ethUSDOracle;
        thresholdNewTokenPair = _thresholdNewTokenPair;
        thresholdNewAuction = _thresholdNewAuction;
    }

    function updateAuctioneer(
        address _auctioneer
    )
        public
        onlyAuctioneer
    {
        require(_auctioneer != address(0));
        auctioneer = _auctioneer;
    }

    function initiateEthUsdOracleUpdate(
        PriceOracleInterface _ethUSDOracle
    )
        public
        onlyAuctioneer
    {         
        require(address(_ethUSDOracle) != address(0));
        newProposalEthUSDOracle = _ethUSDOracle;
        oracleInterfaceCountdown = add(now, WAITING_PERIOD_CHANGE_MASTERCOPY_OR_ORACLE);
        NewOracleProposal(_ethUSDOracle);
    }

    function updateEthUSDOracle()
        public
        onlyAuctioneer
    {
        require(address(newProposalEthUSDOracle) != address(0));
        require(oracleInterfaceCountdown < now);
        ethUSDOracle = newProposalEthUSDOracle;
        newProposalEthUSDOracle = PriceOracleInterface(0);
    }

    function updateThresholdNewTokenPair(
        uint _thresholdNewTokenPair
    )
        public
        onlyAuctioneer
    {
        thresholdNewTokenPair = _thresholdNewTokenPair;
    }

    function updateThresholdNewAuction(
        uint _thresholdNewAuction
    )
        public
        onlyAuctioneer
    {
        thresholdNewAuction = _thresholdNewAuction;
    }

    function updateApprovalOfToken(
        address[] token,
        bool approved
    )
        public
        onlyAuctioneer
     {  
        for(uint i = 0; i < token.length; i++) {
            approvedTokens[token[i]] = approved;
            Approval(token[i], approved);
        }
     }

     function startMasterCopyCountdown (
        address _masterCopy
     )
        public
        onlyAuctioneer
    {
        require(_masterCopy != address(0));

        // Update masterCopyCountdown
        newMasterCopy = _masterCopy;
        masterCopyCountdown = add(now, WAITING_PERIOD_CHANGE_MASTERCOPY_OR_ORACLE);
        NewMasterCopyProposal(_masterCopy);
    }

    function updateMasterCopy()
        public
        onlyAuctioneer
    {
        require(newMasterCopy != address(0));
        require(now >= masterCopyCountdown);

        // Update masterCopy
        masterCopy = newMasterCopy;
        newMasterCopy = address(0);
    }

    /// @param initialClosingPriceNum initial price will be 2 * initialClosingPrice. This is its numerator
    /// @param initialClosingPriceDen initial price will be 2 * initialClosingPrice. This is its denominator
    function addTokenPair(
        address token1,
        address token2,
        uint token1Funding,
        uint token2Funding,
        uint initialClosingPriceNum,
        uint initialClosingPriceDen 
    )
        public
    {
        // R1
        require(token1 != token2);

        // R2
        require(initialClosingPriceNum != 0);

        // R3
        require(initialClosingPriceDen != 0);

        // R4
        require(getAuctionIndex(token1, token2) == 0);

        // R5: to prevent overflow
        require(initialClosingPriceNum < 10 ** 18);

        // R6
        require(initialClosingPriceDen < 10 ** 18);

        setAuctionIndex(token1, token2);

        token1Funding = min(token1Funding, balances[token1][msg.sender]);
        token2Funding = min(token2Funding, balances[token2][msg.sender]);

        // R7
        require(token1Funding < 10 ** 30);

        // R8
        require(token2Funding < 10 ** 30);

        uint fundedValueUSD;
        uint ethUSDPrice = ethUSDOracle.getUSDETHPrice();

        // Compute fundedValueUSD
        address ethTokenMem = ethToken;
        if (token1 == ethTokenMem) {
            // C1
            // MUL: 10^30 * 10^6 = 10^36
            fundedValueUSD = mul(token1Funding, ethUSDPrice);
        } else if (token2 == ethTokenMem) {
            // C2
            // MUL: 10^30 * 10^6 = 10^36
            fundedValueUSD = mul(token2Funding, ethUSDPrice);
        } else {
            // C3: Neither token is ethToken
            fundedValueUSD = calculateFundedValueTokenToken(token1, token2, 
                token1Funding, token2Funding, ethTokenMem, ethUSDPrice);
        }

        // R5
        require(fundedValueUSD >= thresholdNewTokenPair);

        // Save prices of opposite auctions
        closingPrices[token1][token2][0] = fraction(initialClosingPriceNum, initialClosingPriceDen);
        closingPrices[token2][token1][0] = fraction(initialClosingPriceDen, initialClosingPriceNum);

        // Split into two fns because of 16 local-var cap
        addTokenPairSecondPart(token1, token2, token1Funding, token2Funding);
    }

    function calculateFundedValueTokenToken(
        address token1,
        address token2,
        uint token1Funding,
        uint token2Funding,
        address ethTokenMem,
        uint ethUSDPrice
    )
        internal
        view
        returns (uint fundedValueUSD)
    {
        // We require there to exist ethToken-Token auctions
        // R3.1
        require(getAuctionIndex(token1, ethTokenMem) > 0);

        // R3.2
        require(getAuctionIndex(token2, ethTokenMem) > 0);

        // Price of Token 1
        uint priceToken1Num;
        uint priceToken1Den;
        (priceToken1Num, priceToken1Den) = getPriceOfTokenInLastAuction(token1);

        // Price of Token 2
        uint priceToken2Num;
        uint priceToken2Den;
        (priceToken2Num, priceToken2Den) = getPriceOfTokenInLastAuction(token2);

        // Compute funded value in ethToken and USD
        // 10^30 * 10^30 = 10^60
        uint fundedValueETH = add(mul(token1Funding, priceToken1Num) / priceToken1Den,
            token2Funding * priceToken2Num / priceToken2Den);

        fundedValueUSD = mul(fundedValueETH, ethUSDPrice);
    }

    function addTokenPairSecondPart(
        address token1,
        address token2,
        uint token1Funding,
        uint token2Funding
    )
        internal
    {
        balances[token1][msg.sender] = sub(balances[token1][msg.sender], token1Funding);
        balances[token2][msg.sender] = sub(balances[token2][msg.sender], token2Funding);

        // Fee mechanism, fees are added to extraTokens
        uint token1FundingAfterFee = settleFee(token1, token2, 1, token1Funding);
        uint token2FundingAfterFee = settleFee(token2, token1, 1, token2Funding);

        // Update other variables
        sellVolumesCurrent[token1][token2] = token1FundingAfterFee;
        sellVolumesCurrent[token2][token1] = token2FundingAfterFee;
        sellerBalances[token1][token2][1][msg.sender] = token1FundingAfterFee;
        sellerBalances[token2][token1][1][msg.sender] = token2FundingAfterFee;
        
        setAuctionStart(token1, token2, WAITING_PERIOD_NEW_TOKEN_PAIR);
        NewTokenPair(token1, token2);
    }

    function deposit(
        address tokenAddress,
        uint amount
    )
        public
        returns (uint)
    {
        // R1
        require(Token(tokenAddress).transferFrom(msg.sender, this, amount));

        uint newBal = add(balances[tokenAddress][msg.sender], amount);

        balances[tokenAddress][msg.sender] = newBal;

        NewDeposit(tokenAddress, amount);

        return newBal;
    }

    function withdraw(
        address tokenAddress,
        uint amount
    )
        public
        returns (uint)
    {
        uint usersBalance = balances[tokenAddress][msg.sender];
        amount = min(amount, usersBalance);

        // R1
        require(amount > 0);

        // R2
        require(Token(tokenAddress).transfer(msg.sender, amount));

        uint newBal = sub(usersBalance, amount);
        balances[tokenAddress][msg.sender] = newBal;

        NewWithdrawal(tokenAddress, amount);

        return newBal;
    }

    function postSellOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        public
        returns (uint, uint)
    {
        // Note: if a user specifies auctionIndex of 0, it
        // means he is agnostic which auction his sell order goes into

        amount = min(amount, balances[sellToken][msg.sender]);

        // R1
        require(amount > 0);
        
        // R2
        uint latestAuctionIndex = getAuctionIndex(sellToken, buyToken);
        require(latestAuctionIndex > 0);
      
        // R3
        uint auctionStart = getAuctionStart(sellToken, buyToken);
        if (auctionStart == AUCTION_START_WAITING_FOR_FUNDING || auctionStart > now) {
            // C1: We are in the 10 minute buffer period
            // OR waiting for an auction to receive sufficient sellVolume
            // Auction has already cleared, and index has been incremented
            // sell order must use that auction index
            // R1.1
            if (auctionIndex == 0) {
                auctionIndex = latestAuctionIndex;
            } else {
                require(auctionIndex == latestAuctionIndex);
            }

            // R1.2
            require(add(sellVolumesCurrent[sellToken][buyToken], amount) < 10 ** 30);
        } else {
            // C2
            // R2.1: Sell orders must go to next auction
            if (auctionIndex == 0) {
                auctionIndex = latestAuctionIndex + 1;
            } else {
                require(auctionIndex == latestAuctionIndex + 1);
            }

            // R2.2
            require(add(sellVolumesNext[sellToken][buyToken], amount) < 10 ** 30);
        }

        // Fee mechanism, fees are added to extraTokens
        uint amountAfterFee = settleFee(sellToken, buyToken, auctionIndex, amount);

        // Update variables
        balances[sellToken][msg.sender] = sub(balances[sellToken][msg.sender], amount);
        uint newSellerBal = add(sellerBalances[sellToken][buyToken][auctionIndex][msg.sender], amountAfterFee);
        sellerBalances[sellToken][buyToken][auctionIndex][msg.sender] = newSellerBal;

        if (auctionStart == AUCTION_START_WAITING_FOR_FUNDING || auctionStart > now) {
            // C1
            uint sellVolumeCurrent = sellVolumesCurrent[sellToken][buyToken];
            sellVolumesCurrent[sellToken][buyToken] = add(sellVolumeCurrent, amountAfterFee);
        } else {
            // C2
            uint sellVolumeNext = sellVolumesNext[sellToken][buyToken];
            sellVolumesNext[sellToken][buyToken] = add(sellVolumeNext, amountAfterFee);
        }

        if (auctionStart == AUCTION_START_WAITING_FOR_FUNDING) {
            scheduleNextAuction(sellToken, buyToken);
        }

        NewSellOrder(sellToken, buyToken, msg.sender, auctionIndex, amountAfterFee);

        return (auctionIndex, newSellerBal);
    }

    function postBuyOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        public
        returns (uint)
    {
        // R1: auction must not have cleared
        require(closingPrices[sellToken][buyToken][auctionIndex].den == 0);

        uint auctionStart = getAuctionStart(sellToken, buyToken);

        // R2
        require(auctionStart <= now);

        // R4
        require(auctionIndex == getAuctionIndex(sellToken, buyToken));
        
        // R5: auction must not be in waiting period
        require(auctionStart > AUCTION_START_WAITING_FOR_FUNDING);
        
        // R6: auction must be funded
        require(sellVolumesCurrent[sellToken][buyToken] > 0);
        
        uint buyVolume = buyVolumes[sellToken][buyToken];
        amount = min(amount, balances[buyToken][msg.sender]);

        // R7
        require(add(buyVolume, amount) < 10 ** 30);
        
        // Overbuy is when a part of a buy order clears an auction
        // In that case we only process the part before the overbuy
        // To calculate overbuy, we first get current price
        uint sellVolume = sellVolumesCurrent[sellToken][buyToken];

        uint num;
        uint den;
        (num, den) = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);
        // 10^30 * 10^37 = 10^67
        uint outstandingVolume = atleastZero(int(mul(sellVolume, num) / den - buyVolume));

        uint amountAfterFee;
        if (amount < outstandingVolume) {
            if (amount > 0) {
                amountAfterFee = settleFee(buyToken, sellToken, auctionIndex, amount);
            }
        } else {
            amount = outstandingVolume;
            amountAfterFee = outstandingVolume;
        }

        // Here we could also use outstandingVolume or amountAfterFee, it doesn't matter
        if (amount > 0) {
            // Update variables
            balances[buyToken][msg.sender] = sub(balances[buyToken][msg.sender], amount);
            uint newBuyerBal = add(buyerBalances[sellToken][buyToken][auctionIndex][msg.sender], amountAfterFee);
            buyerBalances[sellToken][buyToken][auctionIndex][msg.sender] = newBuyerBal;
            buyVolumes[sellToken][buyToken] = add(buyVolumes[sellToken][buyToken], amountAfterFee);
            NewBuyOrder(sellToken, buyToken, msg.sender, auctionIndex, amountAfterFee);
        }

        // Checking for equality would suffice here. nevertheless:
        if (amount >= outstandingVolume) {
            // Clear auction
            clearAuction(sellToken, buyToken, auctionIndex, sellVolume);
        }

        return (newBuyerBal);
    }
    
    function claimSellerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        // < (10^60, 10^61)
        returns (uint returned, uint frtsIssued)
    {
        closeTheoreticalClosedAuction(sellToken, buyToken, auctionIndex);
        uint sellerBalance = sellerBalances[sellToken][buyToken][auctionIndex][user];

        // R1
        require(sellerBalance > 0);

        // Get closing price for said auction
        fraction memory closingPrice = closingPrices[sellToken][buyToken][auctionIndex];
        uint num = closingPrice.num;
        uint den = closingPrice.den;

        // R2: require auction to have cleared
        require(den > 0);

        // Calculate return
        // < 10^30 * 10^30 = 10^60
        returned = mul(sellerBalance, num) / den;

        frtsIssued = issueFrts(sellToken, buyToken, returned, auctionIndex, sellerBalance, user);

        // Claim tokens
        sellerBalances[sellToken][buyToken][auctionIndex][user] = 0;
        if (returned > 0) {
            balances[buyToken][user] = add(balances[buyToken][user], returned);
        }
        NewSellerFundsClaim(sellToken, buyToken, user, auctionIndex, returned, frtsIssued);
    }

    function claimBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        returns (uint returned, uint frtsIssued)
    {
        closeTheoreticalClosedAuction(sellToken, buyToken, auctionIndex);
        
        uint num;
        uint den;
        (returned, num, den) = getUnclaimedBuyerFunds(sellToken, buyToken, user, auctionIndex);

        if (closingPrices[sellToken][buyToken][auctionIndex].den == 0) {
            // Auction is running
            claimedAmounts[sellToken][buyToken][auctionIndex][user] = add(claimedAmounts[sellToken][buyToken][auctionIndex][user], returned);
        } else {
            // Auction has closed
            // We DON'T want to check for returned > 0, because that would fail if a user claims
            // intermediate funds & auction clears in same block (he/she would not be able to claim extraTokens)

            // Assign extra sell tokens (this is possible only after auction has cleared,
            // because buyVolume could still increase before that)
            uint extraTokensTotal = extraTokens[sellToken][buyToken][auctionIndex];
            uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];

            // closingPrices.num represents buyVolume
            // < 10^30 * 10^30 = 10^60
            uint tokensExtra = mul(buyerBalance, extraTokensTotal) / closingPrices[sellToken][buyToken][auctionIndex].num;
            returned = add(returned, tokensExtra);

            frtsIssued = issueFrts(buyToken, sellToken, mul(buyerBalance, den) / num, auctionIndex, buyerBalance, user);

            // Auction has closed
            // Reset buyerBalances and claimedAmounts
            buyerBalances[sellToken][buyToken][auctionIndex][user] = 0;
            claimedAmounts[sellToken][buyToken][auctionIndex][user] = 0; 
        }

        // Claim tokens
        if (returned > 0) {
            balances[sellToken][user] = add(balances[sellToken][user], returned);
        }
        
        NewBuyerFundsClaim(sellToken, buyToken, user, auctionIndex, returned, frtsIssued);
    }

    function issueFrts(
        address primaryToken,
        address secondaryToken,
        uint x,
        uint auctionIndex,
        uint bal,
        address user
    )
        internal
        returns (uint frtsIssued)
    {
        if (approvedTokens[primaryToken] && approvedTokens[secondaryToken]) {
            address ethTokenMem = ethToken;
            // Get frts issued based on ETH price of returned tokens
            if (primaryToken == ethTokenMem) {
                frtsIssued = bal;
            } else if (secondaryToken == ethTokenMem) {
                // 10^30 * 10^39 = 10^66
                frtsIssued = x;
            } else {
                // Neither token is ethToken, so we use getHhistoricalPriceOracle()
                uint pastNum;
                uint pastDen;
                (pastNum, pastDen) = getPriceInPastAuction(primaryToken, ethTokenMem, auctionIndex - 1);
                // 10^30 * 10^35 = 10^65
                frtsIssued = mul(bal, pastNum) / pastDen;
            }

            if (frtsIssued > 0) {
                // Issue frtToken
                frtToken.mintTokens(user, frtsIssued);
            }
        }
    }

    //@dev allows to close possible theoretical closed markets
    //@param sellToken sellToken of an auction
    //@param buyToken buyToken of an auction 
    //@param index is the auctionIndex of the auction
    function closeTheoreticalClosedAuction(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
    {
        if(auctionIndex == getAuctionIndex(buyToken, sellToken) && closingPrices[sellToken][buyToken][auctionIndex].num == 0) {
            uint buyVolume = buyVolumes[sellToken][buyToken];
            uint sellVolume = sellVolumesCurrent[sellToken][buyToken];
            uint num;
            uint den;
            (num, den) = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);
            // 10^30 * 10^37 = 10^67
            uint outstandingVolume = atleastZero(int(mul(sellVolume, num) / den - buyVolume));
            
            if(outstandingVolume == 0) {
                postBuyOrder(sellToken, buyToken, auctionIndex, 0);
            }
        }
    }

    /// @dev Claim buyer funds for one auction
    function getUnclaimedBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        view
        // < (10^67, 10^37)
        returns (uint unclaimedBuyerFunds, uint num, uint den)
    {
        // R1: checks if particular auction has ever run
        require(auctionIndex <= getAuctionIndex(sellToken, buyToken));

        (num, den) = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);

        if (num == 0) {
            // This should rarely happen - as long as there is >= 1 buy order,
            // auction will clear before price = 0. So this is just fail-safe
            unclaimedBuyerFunds = 0;
        } else {
            uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];
            // < 10^30 * 10^37 = 10^67
            unclaimedBuyerFunds = atleastZero(int(
                mul(buyerBalance, den) / num - 
                claimedAmounts[sellToken][buyToken][auctionIndex][user]
            ));
        }
    }

    function settleFee(
        address primaryToken,
        address secondaryToken,
        uint auctionIndex,
        uint amount
    )
        internal
        // < 10^30
        returns (uint amountAfterFee)
    {
        uint feeNum;
        uint feeDen;
        (feeNum, feeDen) = getFeeRatio(msg.sender);
        // 10^30 * 10^3 / 10^4 = 10^29
        uint fee = mul(amount, feeNum) / feeDen;

        if (fee > 0) {
            fee = settleFeeSecondPart(primaryToken, fee);
            
            uint usersExtraTokens = extraTokens[primaryToken][secondaryToken][auctionIndex + 1];
            extraTokens[primaryToken][secondaryToken][auctionIndex + 1] = add(usersExtraTokens, fee);

            Fee(primaryToken, secondaryToken, msg.sender, auctionIndex, fee);
        }
        
        amountAfterFee = sub(amount, fee);
    }

    function settleFeeSecondPart(
        address primaryToken,
        uint fee
    )
        internal
        returns (uint newFee)
    {
        // Allow user to reduce up to half of the fee with owlToken
        uint num;
        uint den;
        (num, den) = getPriceOfTokenInLastAuction(primaryToken);

        // Convert fee to ETH, then USD
        // 10^29 * 10^30 / 10^30 = 10^29
        uint feeInETH = mul(fee, num) / den;

        uint ethUSDPrice = ethUSDOracle.getUSDETHPrice();
        // 10^29 * 10^6 = 10^35
        // Uses 18 decimal places <> exactly as owlToken tokens: 10**18 owlToken == 1 USD 
        uint feeInUSD = mul(feeInETH, ethUSDPrice);
        uint amountOfowlTokenBurned = min(owlToken.allowance(msg.sender, this), feeInUSD / 2);
        amountOfowlTokenBurned = min(owlToken.balanceOf(msg.sender), amountOfowlTokenBurned);


        if (amountOfowlTokenBurned > 0) {
            owlToken.burnOWL(msg.sender, amountOfowlTokenBurned);
            // Adjust fee
            // 10^35 * 10^29 = 10^64
            uint adjustment = mul(amountOfowlTokenBurned, fee) / feeInUSD;
            newFee = sub(fee, adjustment);
        } else {
            newFee = fee;
        }
    }
    
    function getFeeRatio(
        address user
    )
        public
        view
        // feeRatio < 10^4
        returns (uint num, uint den)
    {
        uint t = frtToken.totalSupply();
        uint b = frtToken.lockedTokenBalances(user);

        if (b * 100000 < t || t == 0) {
            // 0.5%
            num = 1;
            den = 200;
        } else if (b * 10000 < t) {
            // 0.4%
            num = 1;
            den = 250;
        } else if (b * 1000 < t) {
            // 0.3%
            num = 3;
            den = 1000;
        } else if (b * 100 < t) {
            // 0.2%
            num = 1;
            den = 500;
        } else if (b * 10 < t) {
            // 0.1%
            num = 1;
            den = 1000;
        } else {
            // 0% 
            num = 0; 
            den = 1;
        }
    }

    /// @dev clears an Auction
    /// @param sellToken sellToken of the auction
    /// @param buyToken  buyToken of the auction
    /// @param auctionIndex of the auction to be cleared.
    function clearAuction(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint sellVolume
    )
        internal
    {
        // Get variables
        uint buyVolume = buyVolumes[sellToken][buyToken];
        uint sellVolumeOpp = sellVolumesCurrent[buyToken][sellToken];
        uint closingPriceOppDen = closingPrices[buyToken][sellToken][auctionIndex].den;
        uint auctionStart = getAuctionStart(sellToken, buyToken);

        // Update closing price
        if (sellVolume > 0) {
            closingPrices[sellToken][buyToken][auctionIndex] = fraction(buyVolume, sellVolume);
        }

        // if (opposite is 0 auction OR price = 0 OR opposite auction cleared)
        // price = 0 happens if auction pair has been running for >= 24 hrs = 86400
        if (sellVolumeOpp == 0 || now >= auctionStart + 86400 || closingPriceOppDen > 0) {
            // Close auction pair
            uint buyVolumeOpp = buyVolumes[buyToken][sellToken];
            if (closingPriceOppDen == 0 && sellVolumeOpp > 0) {
                // Save opposite price
                closingPrices[buyToken][sellToken][auctionIndex] = fraction(buyVolumeOpp, sellVolumeOpp);
            }

            uint sellVolumeNext = sellVolumesNext[sellToken][buyToken];
            uint sellVolumeNextOpp = sellVolumesNext[buyToken][sellToken];

            // Update state variables for both auctions
            sellVolumesCurrent[sellToken][buyToken] = sellVolumeNext;
            if (sellVolumeNext > 0) {
                sellVolumesNext[sellToken][buyToken] = 0;
            }
            if (buyVolume > 0) {
                buyVolumes[sellToken][buyToken] = 0;
            }

            sellVolumesCurrent[buyToken][sellToken] = sellVolumeNextOpp;
            if (sellVolumeNextOpp > 0) {
                sellVolumesNext[buyToken][sellToken] = 0;
            }
            if (buyVolumeOpp > 0) {
                buyVolumes[buyToken][sellToken] = 0;
            }

            // Increment auction index
            setAuctionIndex(sellToken, buyToken);
            // Check if next auction can be scheduled
            scheduleNextAuction(sellToken, buyToken);
        }

        AuctionCleared(sellToken, buyToken, sellVolume, buyVolume, auctionIndex);
    }

    function scheduleNextAuction(
        address sellToken,
        address buyToken
    )
        internal
    {
        // Check if auctions received enough sell orders
        uint ethUSDPrice = ethUSDOracle.getUSDETHPrice();

        uint sellNum;
        uint sellDen;
        (sellNum, sellDen) = getPriceOfTokenInLastAuction(sellToken);

        uint buyNum;
        uint buyDen;
        (buyNum, buyDen) = getPriceOfTokenInLastAuction(buyToken);

        // We use current sell volume, because in clearAuction() we set
        // sellVolumesCurrent = sellVolumesNext before calling this function
        // (this is so that we don't need case work,
        // since it might also be called from postSellOrder())

        // < 10^30 * 10^31 * 10^6 = 10^67
        uint sellVolume = mul(mul(sellVolumesCurrent[sellToken][buyToken], sellNum), ethUSDPrice) / sellDen;
        uint sellVolumeOpp = mul(mul(sellVolumesCurrent[buyToken][sellToken], buyNum), ethUSDPrice) / buyDen;
        if (sellVolume >= thresholdNewAuction || sellVolumeOpp >= thresholdNewAuction) {
            // Schedule next auction
            setAuctionStart(sellToken, buyToken, WAITING_PERIOD_NEW_AUCTION);
        } else {
            resetAuctionStart(sellToken, buyToken);
        }
    }

    //@ dev returns price in units [token2]/[token1]
    //@ param token1 first token for price calculation
    //@ param token2 second token for price calculation
    //@ param auctionIndex index for the auction to get the averaged price from
    function getPriceInPastAuction(
        address token1,
        address token2,
        uint auctionIndex
    )
        public
        view
        // price < 10^31
        returns (uint num, uint den)
    {
        if (token1 == token2) {
            // C1
            num = 1;
            den = 1;
        } else {
            // C2
            // R2.1
            require(auctionIndex >= 0);


            // C3
            // R3.1
            require(auctionIndex <= getAuctionIndex(token1, token2));
            // auction still running

            uint i = 0;
            bool correctPair = false;
            fraction memory closingPriceToken1;
            fraction memory closingPriceToken2;

            while (!correctPair) {
                closingPriceToken2 = closingPrices[token2][token1][auctionIndex - i];
                closingPriceToken1 = closingPrices[token1][token2][auctionIndex - i];
                
                if (closingPriceToken1.num > 0 && closingPriceToken1.den > 0 || 
                    closingPriceToken2.num > 0 && closingPriceToken2.den > 0)
                {
                    correctPair = true;
                }
                i++;
            }

            // At this point at least one closing price is strictly positive
            // If only one is positive, we want to output that
            if (closingPriceToken1.num == 0 || closingPriceToken1.den == 0) {
                num = closingPriceToken2.den;
                den = closingPriceToken2.num;
            } else if (closingPriceToken2.num == 0 || closingPriceToken2.den == 0) {
                num = closingPriceToken1.num;
                den = closingPriceToken1.den;
            } else {
                // If both prices are positive, output weighted average
                num = closingPriceToken2.den + closingPriceToken1.num;
                den = closingPriceToken2.num + closingPriceToken1.den;
            }
        } 
    }

    /// @dev Gives best estimate for market price of a token in ETH of any price oracle on the Ethereum network
    /// @param token address of ERC-20 token
    /// @return Weighted average of closing prices of opposite Token-ethToken auctions, based on their sellVolume  
    function getPriceOfTokenInLastAuction(
        address token
    )
        public
        view
        // price < 10^31
        returns (uint num, uint den)
    {
        uint latestAuctionIndex = getAuctionIndex(token, ethToken);
        // getPriceInPastAuction < 10^30
        (num, den) = getPriceInPastAuction(token, ethToken, latestAuctionIndex - 1);
    }

    function getCurrentAuctionPrice(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        view
        // price < 10^37
        returns (uint num, uint den)
    {
        fraction memory closingPrice = closingPrices[sellToken][buyToken][auctionIndex];

        if (closingPrice.den != 0) {
            // Auction has closed
            (num, den) = (closingPrice.num, closingPrice.den);
        } else if (auctionIndex > getAuctionIndex(sellToken, buyToken)) {
            (num, den) = (0, 0);
        } else {
            // Auction is running
            uint pastNum;
            uint pastDen;
            (pastNum, pastDen) = getPriceInPastAuction(sellToken, buyToken, auctionIndex - 1);

            // If we're calling the function into an unstarted auction,
            // it will return the starting price of that auction
            uint timeElapsed = atleastZero(int(now - getAuctionStart(sellToken, buyToken)));

            // The numbers below are chosen such that
            // P(0 hrs) = 2 * lastClosingPrice, P(6 hrs) = lastClosingPrice, P(>=24 hrs) = 0

            // 10^5 * 10^31 = 10^36
            num = atleastZero(int((86400 - timeElapsed) * pastNum));
            // 10^6 * 10^31 = 10^37
            den = mul((timeElapsed + 43200), pastDen);

            if (mul(num, sellVolumesCurrent[sellToken][buyToken]) <= mul(den, buyVolumes[sellToken][buyToken])) {
                num = buyVolumes[sellToken][buyToken];
                den = sellVolumesCurrent[sellToken][buyToken];
            }
        }
    }

    function depositAndSell(
        address sellToken,
        address buyToken,
        uint amount
    )
        external
        returns (uint newBal, uint auctionIndex, uint newSellerBal)
    {
        newBal = deposit(sellToken, amount);
        (auctionIndex, newSellerBal) = postSellOrder(sellToken, buyToken, 0, amount);
    }

    function claimAndWithdraw(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex,
        uint amount
    )
        external
        returns (uint returned, uint frtsIssued, uint newBal)
    {
        (returned, frtsIssued) = claimSellerFunds(sellToken, buyToken, user, auctionIndex);
        newBal = withdraw(buyToken, amount);
    }

    // > Helper fns
    function getTokenOrder(
        address token1,
        address token2
    )
        public
        pure
        returns (address, address)
    {
        if (token2 < token1) {
            (token1, token2) = (token2, token1);
        }

        return (token1, token2);
    }

    function setAuctionStart(
        address token1,
        address token2,
        uint value
    )
        internal
    {
        (token1, token2) = getTokenOrder(token1, token2);        
        uint auctionStart = now + value;
        uint auctionIndex = latestAuctionIndices[token1][token2];
        auctionStarts[token1][token2] = auctionStart;
        AuctionStartScheduled(token1, token2, auctionIndex, auctionStart);
    }

    function resetAuctionStart(
        address token1,
        address token2
    )
        internal
    {
        (token1, token2) = getTokenOrder(token1, token2);
        if (auctionStarts[token1][token2] != AUCTION_START_WAITING_FOR_FUNDING) {
            auctionStarts[token1][token2] = AUCTION_START_WAITING_FOR_FUNDING;
        }
    }

    function getAuctionStart(
        address token1,
        address token2
    )
        public
        view
        returns (uint auctionStart)
    {
        (token1, token2) = getTokenOrder(token1, token2);
        auctionStart = auctionStarts[token1][token2];
    }

    function setAuctionIndex(
        address token1,
        address token2
    )
        internal
    {
        (token1, token2) = getTokenOrder(token1, token2);
        latestAuctionIndices[token1][token2] += 1;
    }


    function getAuctionIndex(
        address token1,
        address token2
    )
        public
        view
        returns (uint auctionIndex) 
    {
        (token1, token2) = getTokenOrder(token1, token2);
        auctionIndex = latestAuctionIndices[token1][token2];
    }

    // > Math fns
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

    function atleastZero(int a)
        public
        pure
        returns (uint)
    {
        if (a < 0) {
            return 0;
        } else {
            return uint(a);
        }
    }
    /// @dev Returns whether an add operation causes an overflow
    /// @param a First addend
    /// @param b Second addend
    /// @return Did no overflow occur?
    function safeToAdd(uint a, uint b)
        public
        pure
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
        pure
        returns (bool)
    {
        return a >= b;
    }

    /// @dev Returns whether a multiply operation causes an overflow
    /// @param a First factor
    /// @param b Second factor
    /// @return Did no overflow occur?
    function safeToMul(uint a, uint b)
        public
        pure
        returns (bool)
    {
        return b == 0 || a * b / b == a;
    }

    /// @dev Returns sum if no overflow occurred
    /// @param a First addend
    /// @param b Second addend
    /// @return Sum
    function add(uint a, uint b)
        public
        pure
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
        pure
        returns (uint)
    {
        require(safeToSub(a, b));
        return a - b;
    }

    /// @dev Returns product if no overflow occurred
    /// @param a First factor
    /// @param b Second factor
    /// @return Product
    function mul(uint a, uint b)
        public
        pure
        returns (uint)
    {
        require(safeToMul(a, b));
        return a * b;
    }

    function getRunningTokenPairs(
        address[] tokens
    )
        external
        view
        returns (address[] tokens1, address[] tokens2)
    {
        uint arrayLength;

        for (uint k = 0; k < tokens.length - 1; k++) {
            for (uint l = k + 1; l < tokens.length; l++) {
                if (getAuctionIndex(tokens[k], tokens[l]) > 0) {
                    arrayLength++;
                }
            }
        }

        tokens1 = new address[](arrayLength);
        tokens2 = new address[](arrayLength);

        uint h;

        for (uint i = 0; i < tokens.length - 1; i++) {
            for (uint j = i + 1; j < tokens.length; j++) {
                if (getAuctionIndex(tokens[i], tokens[j]) > 0) {
                    tokens1[h] = tokens[i];
                    tokens2[h] = tokens[j];
                    h++;
                }
            }
        }
    }
    
    //@dev for quick overview of possible sellerBalances to calculate the possible withdraw tokens
    //@param auctionSellToken is the sellToken defining an auctionPair
    //@param auctionBuyToken is the buyToken defining an auctionPair
    //@param user is the user who wants to his tokens
    //@param lastNAuctions how many auctions will be checked. 0 means all
    //@returns returns sellbal for all indices for all tokenpairs 
    function getIndicesWithClaimableTokensForSellers(
        address auctionSellToken,
        address auctionBuyToken,
        address user,
        uint lastNAuctions
    )
        external
        view
        returns(uint[] indices, uint[] usersBalances)
    {
        uint runningAuctionIndex = getAuctionIndex(auctionSellToken, auctionBuyToken);

        uint arrayLength;
        
        uint startingIndex = lastNAuctions == 0 ? 1 : runningAuctionIndex - lastNAuctions + 1;

        for (uint j = startingIndex; j <= runningAuctionIndex; j++) {
            if (sellerBalances[auctionSellToken][auctionBuyToken][j][user] > 0) {
                arrayLength++;
            }
        }

        indices = new uint[](arrayLength);
        usersBalances = new uint[](arrayLength);

        uint k;

        for (uint i = startingIndex; i <= runningAuctionIndex; i++) {
            if (sellerBalances[auctionSellToken][auctionBuyToken][i][user] > 0) {
                indices[k] = i;
                usersBalances[k] = sellerBalances[auctionSellToken][auctionBuyToken][i][user];
                k++;
            }
        }
    }    

    //@dev for quick overview of current sellerBalances for a user
    //@param auctionSellTokens are the sellTokens defining an auctionPair
    //@param auctionBuyTokens are the buyTokens defining an auctionPair
    //@param user is the user who wants to his tokens
    function getSellerBalancesOfCurrentAuctions(
        address[] auctionSellTokens,
        address[] auctionBuyTokens,
        address user
    )
        external
        view
        returns (uint[])
    {
        uint length = auctionSellTokens.length;
        uint length2 = auctionBuyTokens.length;
        require(length == length2);

        uint[] memory sellersBalances = new uint[](length);

        for (uint i = 0; i < length; i++) {
            uint runningAuctionIndex = getAuctionIndex(auctionSellTokens[i], auctionBuyTokens[i]);
            sellersBalances[i] = sellerBalances[auctionSellTokens[i]][auctionBuyTokens[i]][runningAuctionIndex][user];
        }

        return sellersBalances;
    }

    //@dev for quick overview of possible buyerBalances to calculate the possible withdraw tokens
    //@param auctionSellToken is the sellToken defining an auctionPair
    //@param auctionBuyToken is the buyToken defining an auctionPair
    //@param user is the user who wants to his tokens
    //@param lastNAuctions how many auctions will be checked. 0 means all
    //@returns returns sellbal for all indices for all tokenpairs 
    function getIndicesWithClaimableTokensForBuyers(
        address auctionSellToken,
        address auctionBuyToken,
        address user,
        uint lastNAuctions
    )
        external
        view
        returns(uint[] indices, uint[] usersBalances)
    {
        uint runningAuctionIndex = getAuctionIndex(auctionSellToken, auctionBuyToken);

        uint arrayLength;
        
        uint startingIndex = lastNAuctions == 0 ? 1 : runningAuctionIndex - lastNAuctions + 1;

        for (uint j = startingIndex; j <= runningAuctionIndex; j++) {
            if (buyerBalances[auctionSellToken][auctionBuyToken][j][user] > 0) {
                arrayLength++;
            }
        }

        indices = new uint[](arrayLength);
        usersBalances = new uint[](arrayLength);

        uint k;

        for (uint i = startingIndex; i <= runningAuctionIndex; i++) {
            if (buyerBalances[auctionSellToken][auctionBuyToken][i][user] > 0) {
                indices[k] = i;
                usersBalances[k] = buyerBalances[auctionSellToken][auctionBuyToken][i][user];
                k++;
            }
        }
    }    

    //@dev for quick overview of current sellerBalances for a user
    //@param auctionSellTokens are the sellTokens defining an auctionPair
    //@param auctionBuyTokens are the buyTokens defining an auctionPair
    //@param user is the user who wants to his tokens
    function getBuyerBalancesOfCurrentAuctions(
        address[] auctionSellTokens,
        address[] auctionBuyTokens,
        address user
    )
        external
        view
        returns (uint[])
    {
        uint length = auctionSellTokens.length;
        uint length2 = auctionBuyTokens.length;
        require(length == length2);

        uint[] memory buyersBalances = new uint[](length);

        for (uint i = 0; i < length; i++) {
            uint runningAuctionIndex = getAuctionIndex(auctionSellTokens[i], auctionBuyTokens[i]);
            buyersBalances[i] = buyerBalances[auctionSellTokens[i]][auctionBuyTokens[i]][runningAuctionIndex][user];
        }

        return buyersBalances;
    }

    //@dev for quick overview of approved Tokens
    //@param addressesToCheck are the ERC-20 token addresses to be checked whether they are approved
    function getApprovedAddressesOfList(
        address[] addressToCheck
    )
        external
        view
        returns (bool[])
    {
        uint length = addressToCheck.length;

        bool[] memory isApproved = new bool[](length);

        for (uint i = 0; i < length; i++) {
            isApproved[i] = approvedTokens[addressToCheck[i]];
        }

        return isApproved;
    }

    //@dev for multiple withdraws
    //@param auctionSellTokens are the sellTokens defining an auctionPair
    //@param auctionBuyTokens are the buyTokens defining an auctionPair
    //@param auctionIndices are the auction indices on which an token should be claimedAmounts
    //@param user is the user who wants to his tokens
    function claimTokensFromSeveralAuctionsAsSeller(
        address[] auctionSellTokens,
        address[] auctionBuyTokens,
        uint[] auctionIndices,
        address user
    )
        external
    {
        uint length = auctionSellTokens.length;
        uint length2 = auctionBuyTokens.length;
        require(length == length2);

        uint length3 = auctionIndices.length;
        require(length2 == length3);

        for (uint i = 0; i < length; i++)
            claimSellerFunds(auctionSellTokens[i], auctionBuyTokens[i], user, auctionIndices[i]);
    }
    //@dev for multiple withdraws
    //@param auctionSellTokens are the sellTokens defining an auctionPair
    //@param auctionBuyTokens are the buyTokens defining an auctionPair
    //@param auctionIndices are the auction indices on which an token should be claimedAmounts
    //@param user is the user who wants to his tokens
    function claimTokensFromSeveralAuctionsAsBuyer(
        address[] auctionSellTokens,
        address[] auctionBuyTokens,
        uint[] auctionIndices,
        address user
    )
        external
    {
        uint length = auctionSellTokens.length;
        uint length2 = auctionBuyTokens.length;
        require(length == length2);

        uint length3 = auctionIndices.length;
        require(length2 == length3);

        for (uint i = 0; i < length; i++)
            claimBuyerFunds(auctionSellTokens[i], auctionBuyTokens[i], user, auctionIndices[i]);
    }

    function getMasterCopy()
        external
        view 
        returns (address)
    {
        return masterCopy;
    }

    // > Events
    event NewDeposit(
         address indexed token,
         uint amount
    );

    event NewOracleProposal(
         PriceOracleInterface priceOracleInterface
    );


    event NewMasterCopyProposal(
         address newMasterCopy
    );

    event NewWithdrawal(
        address indexed token,
        uint amount
    );
    
    event NewSellOrder(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount
    );

    event NewBuyOrder(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount
    );

    event NewSellerFundsClaim(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount,
        uint frtsIssued
    );

    event NewBuyerFundsClaim(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount,
        uint frtsIssued
    );

    event NewTokenPair(
        address indexed sellToken,
        address indexed buyToken
    );

    event AuctionCleared(
        address indexed sellToken,
        address indexed buyToken,
        uint sellVolume,
        uint buyVolume,
        uint indexed auctionIndex
    );

    event Approval(
        address indexed token,
        bool approved
    );

    event AuctionStartScheduled(
        address indexed sellToken,
        address indexed buyToken,
        uint indexed auctionIndex,
        uint auctionStart
    );

    event Fee(
        address indexed primaryToken,
        address indexed secondarToken,
        address indexed user,
        uint auctionIndex,
        uint fee
    );
}
