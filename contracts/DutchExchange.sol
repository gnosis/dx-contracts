pragma solidity ^0.4.19;

import { TokenMGN as TokenFRT } from "./Tokens/TokenMGN.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "./Oracle/PriceOracleInterface.sol";  

/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Alex Herrmann - <alex@gnosis.pm>
/// @author Dominik Teiml - <dominik@gnosis.pm>

contract DutchExchange {
   
    // The price is a rational number, so we need a concept of a fraction
    struct fraction {
        uint num;
        uint den;
    }

    uint constant WAITING_PERIOD_NEW_TOKEN_PAIR = 6 hours;
    uint constant WAITING_PERIOD_NEW_AUCTION = 10 minutes;
    uint constant WAITING_PERIOD_CHANGE_MASTERCOPY= 30 days;
    uint constant AUCTION_START_WAITING_FOR_FUNDING = 1;

    // variables for Proxy Construction
    //
    address masterCopy;
    address public newMasterCopy;
    // Time when new masterCopy is updatabale
    uint public masterCopyCountdown;

    // > Storage
    // auctioneer has the power to manage some variables
    address public auctioneer;
    // Ether ERC-20 token
    address public ethToken;
    PriceOracleInterface public ethUSDOracle;
    // Minimum required sell funding for adding a new token pair, in USD
    uint public thresholdNewTokenPair;
    // Minimum required sell funding for starting antoher auction, in USD
    uint public thresholdNewAuction;
    // Fee reduction token (magnolia, ERC-20 token)
    TokenFRT public frtToken;
    // Token for paying fees
    TokenOWL public owlToken;

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
        require(
            address(_owlToken) != address(0) &&
            address(_frtToken) != address(0) &&
            _auctioneer != 0 &&
            _ethToken != 0 &&
            address(_ethUSDOracle) != address(0)
        );

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

    function updateEthUSDOracle(
        PriceOracleInterface _ethUSDOracle
    )
        public
        onlyAuctioneer
    {
        require(address(_ethUSDOracle) != address(0));
        ethUSDOracle = _ethUSDOracle;
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
        address token,
        bool approved
    )
        public
        onlyAuctioneer
     {   
        approvedTokens[token] = approved;
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
        masterCopyCountdown = now + WAITING_PERIOD_CHANGE_MASTERCOPY;
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

    // > addTokenPair()
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
            fundedValueUSD = token1Funding * ethUSDPrice;
        } else if (token2 == ethTokenMem) {
            // C2
            // MUL: 10^30 * 10^6 = 10^36
            fundedValueUSD = token2Funding * ethUSDPrice;
        } else {
            // C3: Neither token is ethToken
            // We require there to exist ethToken-Token auctions
            // R3.1
            require(getAuctionIndex(token1, ethTokenMem) > 0);

            // R3.2
            require(getAuctionIndex(token2, ethTokenMem) > 0);

            // Price of Token 1
            fraction memory priceToken1 = getPriceOfTokenInLastAuction(token1);

            // Price of Token 2
            fraction memory priceToken2 = getPriceOfTokenInLastAuction(token2);

            // Compute funded value in ethToken and USD
            // 10^30 * 10^30 = 10^60
            fundedValueUSD = (token1Funding * priceToken1.num / priceToken1.den + 
                token2Funding * priceToken2.num / priceToken2.den) * ethUSDPrice;
        }

        // R5
        require(fundedValueUSD >= thresholdNewTokenPair);

        // Save prices of opposite auctions
        closingPrices[token1][token2][0] = fraction(initialClosingPriceNum, initialClosingPriceDen);
        closingPrices[token2][token1][0] = fraction(initialClosingPriceDen, initialClosingPriceNum);

        // Split into two fns because of 16 local-var cap
        addTokenPair2(token1, token2, token1Funding, token2Funding);
    }

    // > addTokenPair2()
    function addTokenPair2 (
        address token1,
        address token2,
        uint token1Funding,
        uint token2Funding
    )
        internal
    {
        balances[token1][msg.sender] -= token1Funding;
        balances[token2][msg.sender] -= token2Funding;

        // Fee mechanism, fees are added to extraTokens
        uint token1FundingAfterFee = settleFee(token1, token2, 1, msg.sender, token1Funding);
        uint token2FundingAfterFee = settleFee(token2, token1, 1, msg.sender, token2Funding);

        // Update other variables
        sellVolumesCurrent[token1][token2] = token1FundingAfterFee;
        sellVolumesCurrent[token2][token1] = token2FundingAfterFee;
        sellerBalances[token1][token2][1][msg.sender] = token1FundingAfterFee;
        sellerBalances[token2][token1][1][msg.sender] = token2FundingAfterFee;
        
        setAuctionStart(token1, token2, WAITING_PERIOD_NEW_TOKEN_PAIR);
        NewTokenPair(token1, token2);
    }

    // > deposit()
    function deposit(
        address tokenAddress,
        uint amount
    )
        public
    {
        // R1
        require(Token(tokenAddress).transferFrom(msg.sender, this, amount));

        uint balance = balances[tokenAddress][msg.sender];
        balances[tokenAddress][msg.sender] = balance + amount;
        
        //overflow check, we did not use Mathsafe libary, since this is the only place we acutally need it
        require(balance + amount >= amount);

        NewDeposit(tokenAddress, amount);
    }

    // > withdraw()
    function withdraw(
        address tokenAddress,
        uint amount
    )
        public
    {
        // R1
        amount = min(amount, balances[tokenAddress][msg.sender]);
        require(amount > 0);

        balances[tokenAddress][msg.sender] -= amount;

        // R2
        require(Token(tokenAddress).transfer(msg.sender, amount));

        NewWithdrawal(tokenAddress, amount);
    }

     // > postSellOrder()
    function postSellOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        public
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
            require(sellVolumesCurrent[sellToken][buyToken] + amount < 10 ** 30);
        } else {
            // C2
            // R2.1: Sell orders must go to next auction
            if (auctionIndex == 0) {
                auctionIndex = latestAuctionIndex + 1;
            } else {
                require(auctionIndex == latestAuctionIndex + 1);
            }

            // R2.2
            require(sellVolumesNext[sellToken][buyToken] + amount < 10 ** 30);
        }

        // Fee mechanism, fees are added to extraTokens
        uint amountAfterFee = settleFee(sellToken, buyToken, auctionIndex, msg.sender, amount);

        // Update variables
        balances[sellToken][msg.sender] -= amount;
        sellerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
        if (auctionStart == AUCTION_START_WAITING_FOR_FUNDING || auctionStart > now) {
            // C1
            sellVolumesCurrent[sellToken][buyToken] += amountAfterFee;
        } else {
            // C2
            sellVolumesNext[sellToken][buyToken] += amountAfterFee;
        }

        if (auctionStart == AUCTION_START_WAITING_FOR_FUNDING) {
            scheduleNextAuction(sellToken, buyToken);
        }

        NewSellOrder(sellToken, buyToken, msg.sender, auctionIndex, amountAfterFee);
    }

    // > postBuyOrder()
    function postBuyOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        public
    {
        uint auctionStart = getAuctionStart(sellToken, buyToken);

        // R1: auction must not have cleared
        require(closingPrices[sellToken][buyToken][auctionIndex].den == 0);

        // R2
        require(getAuctionStart(sellToken, buyToken) <= now);

        // R4
        require(auctionIndex == getAuctionIndex(sellToken, buyToken));
        
        // R5: auction must not be in waiting period
        require(auctionStart > AUCTION_START_WAITING_FOR_FUNDING);
        
        // R6: auction must be funded
        require(sellVolumesCurrent[sellToken][buyToken] > 0);
        
        uint buyVolume = buyVolumes[sellToken][buyToken];
        amount = min(amount, balances[buyToken][msg.sender]);

        // R7
        require(buyVolume + amount < 10 ** 30);
        
        // Overbuy is when a part of a buy order clears an auction
        // In that case we only process the part before the overbuy
        // To calculate overbuy, we first get current price
        uint sellVolume = sellVolumesCurrent[sellToken][buyToken];
        fraction memory price = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);
        // 10^30 * 10^37 = 10^67
        uint outstandingVolume = atleastZero(int(sellVolume * price.num / price.den - buyVolume));

        uint amountAfterFee;
        if (amount < outstandingVolume) {
            if (amount > 0) {
                amountAfterFee = settleFee(buyToken, sellToken, auctionIndex, msg.sender, amount);
            }
        } else {
            amount = outstandingVolume;
            amountAfterFee = outstandingVolume;
        }

        // Here we could also use outstandingVolume or amountAfterFee, it doesn't matter
        if (amount > 0) {
            // Update variables
            balances[buyToken][msg.sender] -= amount;
            buyerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
            buyVolumes[sellToken][buyToken] += amountAfterFee;
            NewBuyOrder(sellToken, buyToken, msg.sender, auctionIndex, amountAfterFee);
        }

        // Checking for equality would suffice here. nevertheless:
        if (amount >= outstandingVolume) {
            // Clear auction
            clearAuction(sellToken, buyToken, auctionIndex, sellVolume);
        }
    }
    
    // > claimSellerFunds()
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
        returned = sellerBalance * num / den;

        // Get frts issued based on ETH price of returned tokens
        if (approvedTokens[sellToken] == true && approvedTokens[buyToken] == true) {
            address ethTokenMem = ethToken;
            if (sellToken == ethTokenMem) {
                frtsIssued = sellerBalance;
            } else if (buyToken == ethTokenMem) {
                frtsIssued = returned;
            } else {
                // Neither token is ethToken, so we use getPriceOfTokenInLastAuction()
                // getPriceOfTokenInLastAuction() depends on latestAuctionIndex
                // i.e. if a user claims tokens later in the future,
                // he/she is likely to get slightly different number
                fraction memory price = getPriceInPastAuction(sellToken, ethTokenMem, auctionIndex);
                // 10^30 * 10^31 = 10^61
                frtsIssued = sellerBalance * price.num / price.den;
            }

            // Issue tulToken
            if (frtsIssued > 0) {
                frtToken.mintTokens(user, frtsIssued);
            }
        }

        // Claim tokens
        sellerBalances[sellToken][buyToken][auctionIndex][user] = 0;
        if (returned > 0) {
            balances[buyToken][user] += returned;
        }
        NewSellerFundsClaim(sellToken, buyToken, user, auctionIndex, returned, frtsIssued);
    }

    // > claimBuyerFunds()
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
        fraction memory price;
        (returned, price) = getUnclaimedBuyerFunds(sellToken, buyToken, user, auctionIndex);

        uint den = closingPrices[sellToken][buyToken][auctionIndex].den;

        if (den == 0) {
            // Auction is running
            claimedAmounts[sellToken][buyToken][auctionIndex][user] += returned;
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
            uint tokensExtra = buyerBalance * extraTokensTotal / closingPrices[sellToken][buyToken][auctionIndex].num;
            returned += tokensExtra;
 
            if (approvedTokens[buyToken] == true && approvedTokens[sellToken] == true) {
                address ethTokenMem = ethToken;
                // Get frts issued based on ETH price of returned tokens
                if (buyToken == ethTokenMem) {
                    frtsIssued = buyerBalance;
                } else if (sellToken == ethTokenMem) {
                    // 10^30 * 10^39 = 10^66
                    frtsIssued = buyerBalance * price.den / price.num;
                } else {
                    // Neither token is ethToken, so we use getHhistoricalPriceOracle()
                    fraction memory priceEthToken = getPriceInPastAuction(buyToken, ethTokenMem, auctionIndex);
                    // 10^30 * 10^35 = 10^65
                    frtsIssued = buyerBalance * priceEthToken.num / priceEthToken.den;
                }

                if (frtsIssued > 0) {
                    // Issue frtToken
                    frtToken.mintTokens(user, frtsIssued);
                }
            }

            // Auction has closed
            // Reset buyerBalances and claimedAmounts
            buyerBalances[sellToken][buyToken][auctionIndex][user] = 0;
            claimedAmounts[sellToken][buyToken][auctionIndex][user] = 0; 
        }

        // Claim tokens
        if (returned > 0) {
            balances[sellToken][user] += returned;
        }
        
        NewBuyerFundsClaim(sellToken, buyToken, user, auctionIndex, returned, frtsIssued);
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
            fraction memory price = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);
            // 10^30 * 10^37 = 10^67
            uint outstandingVolume = atleastZero(int(sellVolume * price.num / price.den - buyVolume));
            
            if(outstandingVolume == 0) {
                postBuyOrder(sellToken, buyToken, auctionIndex, 0);
            }
        }
    }

    // > getUnclaimedBuyerFunds()
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
        returns (uint unclaimedBuyerFunds, fraction memory price)
    {
        // R1: checks if particular auction has ever run
        require(auctionIndex <= getAuctionIndex(sellToken, buyToken));

        price = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);

        if (price.num == 0) {
            // This should rarely happen - as long as there is >= 1 buy order,
            // auction will clear before price = 0. So this is just fail-safe
            unclaimedBuyerFunds = 0;
        } else {
            uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];
            // < 10^30 * 10^37 = 10^67
            unclaimedBuyerFunds = atleastZero(int(
                buyerBalance * price.den / price.num - 
                claimedAmounts[sellToken][buyToken][auctionIndex][user]
            ));
        }
    }

    // > settleFee()
    function settleFee(
        address primaryToken,
        address secondaryToken,
        uint auctionIndex,
        address user,
        uint amount
    )
        internal
        // < 10^30
        returns (uint amountAfterFee)
    {
        fraction memory feeRatio = getFeeRatio(user);
        // 10^30 * 10^3 / 10^4 = 10^29
        uint fee = amount * feeRatio.num / feeRatio.den;

        if (fee > 0) {
            // Allow user to reduce up to half of the fee with owlToken
            uint ethUSDPrice = ethUSDOracle.getUSDETHPrice();
            fraction memory price = getPriceOfTokenInLastAuction(primaryToken);

            // Convert fee to ETH, then USD
            // 10^29 * 10^30 / 10^30 = 10^29
            uint feeInETH = fee * price.num / price.den;

            // 10^29 * 10^6 = 10^35
            // Uses 18 decimal places <> exactly as owlToken tokens: 10**18 owlToken == 1 USD 
            uint feeInUSD = feeInETH * ethUSDPrice;
            uint amountOfowlTokenBurned = min(owlToken.allowance(msg.sender, this), feeInUSD / 2);

            if (amountOfowlTokenBurned > 0) {
                owlToken.burnOWL(msg.sender, amountOfowlTokenBurned);
                // Adjust fee
                // 10^35 * 10^29 = 10^64
                fee -= amountOfowlTokenBurned * fee / feeInUSD;
            }

            extraTokens[primaryToken][secondaryToken][auctionIndex + 1] += fee;
        }
        
        amountAfterFee = amount - fee;
    }
    
    // > getFeeRatio()
    function getFeeRatio(
        address user
    )
        public
        view
        // feeRatio < 10^4
        returns (fraction memory feeRatio)
    {
        uint t = frtToken.totalSupply();
        uint b = frtToken.lockedTokenBalances(user);

        if (b * 100000 < t || t == 0) {
            // 0.5%
            feeRatio.num = 1;
            feeRatio.den = 200;
        } else if (b * 10000 < t) {
            // 0.4%
            feeRatio.num = 1;
            feeRatio.den = 250;
        } else if (b * 1000 < t) {
            // 0.3%
            feeRatio.num = 3;
            feeRatio.den = 1000;
        } else if (b * 100 < t) {
            // 0.2%
            feeRatio.num = 1;
            feeRatio.den = 500;
        } else if (b * 10 < t) {
            // 0.1%
            feeRatio.num = 1;
            feeRatio.den = 1000;
        } else {
            // 0% 
            feeRatio.num = 0; 
            feeRatio.den = 1;
        }
    }

    // > clearAuction()
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

    // > scheduleNextAuction()
    function scheduleNextAuction(
        address sellToken,
        address buyToken
    )
        internal
    {
        // Check if auctions received enough sell orders
        uint ethUSDPrice = ethUSDOracle.getUSDETHPrice();
        fraction memory priceTs = getPriceOfTokenInLastAuction(sellToken);
        fraction memory priceTb = getPriceOfTokenInLastAuction(buyToken);

        // We use current sell volume, because in clearAuction() we set
        // sellVolumesCurrent = sellVolumesNext before calling this function
        // (this is so that we don't need case work,
        // since it might also be called from postSellOrder())

        // < 10^30 * 10^31 * 10^6 = 10^67
        uint sellVolume = sellVolumesCurrent[sellToken][buyToken] * priceTs.num * ethUSDPrice / priceTs.den;
        uint sellVolumeOpp = sellVolumesCurrent[buyToken][sellToken] * priceTb.num * ethUSDPrice / priceTb.den;
        if (sellVolume >= thresholdNewAuction || sellVolumeOpp >= thresholdNewAuction) {
            // Schedule next auction
            setAuctionStart(sellToken, buyToken, WAITING_PERIOD_NEW_AUCTION);
        } else {
            resetAuctionStart(sellToken, buyToken);
        }
    }



    // > getPriceInPastAuction()
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
        returns (fraction memory price)
    {
        if (token1 == token2) {
            // C1
            price.num = 1;
            price.den = 1;
        } else {
            // C2
            // R2.1
            require(auctionIndex > 0);

            uint i = 0;
            bool correctPair = false;
            fraction memory closingPriceToken1;
            fraction memory closingPriceToken2;

            while (!correctPair) {
                i++;
                closingPriceToken2 = closingPrices[token2][token1][auctionIndex - i];
                closingPriceToken1 = closingPrices[token1][token2][auctionIndex - i];
                
                if (closingPriceToken1.num > 0 && closingPriceToken1.den > 0 || 
                    closingPriceToken2.num > 0 && closingPriceToken2.den > 0)
                {
                    correctPair = true;
                }
            }

            // At this point at least one closing price is strictly positive
            // If only one is positive, we want to output that
            if (closingPriceToken1.num == 0 || closingPriceToken1.den == 0) {
                price.num = closingPriceToken2.den;
                price.den = closingPriceToken2.num;
            } else if (closingPriceToken2.num == 0 || closingPriceToken2.den == 0) {
                price.num = closingPriceToken1.num;
                price.den = closingPriceToken1.den;
            } else {
                // If both prices are positive, output weighted average
                price.num = closingPriceToken2.den + closingPriceToken1.num;
                price.den = closingPriceToken2.num + closingPriceToken1.den;
            }
        } 
    }

    // > getPriceOfTokenInLastAuction()
    /// @dev Gives best estimate for market price of a token in ETH of any price oracle on the Ethereum network
    /// @param token address of ERC-20 token
    /// @return Weighted average of closing prices of opposite Token-ethToken auctions, based on their sellVolume  
    function getPriceOfTokenInLastAuction(
        address token
    )
        public
        view
        // price < 10^31
        returns (fraction memory price)
    {
        uint latestAuctionIndex = getAuctionIndex(token, ethToken);
        // getPriceInPastAuction < 10^30
        price = getPriceInPastAuction(token, ethToken, latestAuctionIndex);
    }

    // > getCurrentAuctionPrice()
    function getCurrentAuctionPrice(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        view
        // price < 10^37
        returns (fraction memory price)
    {
        fraction memory closingPrice = closingPrices[sellToken][buyToken][auctionIndex];

        if (closingPrice.den != 0) {
            // Auction has closed
            (price.num, price.den) = (closingPrice.num, closingPrice.den);
        } else if (auctionIndex > getAuctionIndex(sellToken, buyToken)) {
            (price.num, price.den) = (0, 0);
        } else {
            // Auction is running
            fraction memory averagedPrice = getPriceInPastAuction(sellToken, buyToken, auctionIndex);

            // If we're calling the function into an unstarted auction,
            // it will return the starting price of that auction
            uint timeElapsed = atleastZero(int(now - getAuctionStart(sellToken, buyToken)));

            // The numbers below are chosen such that
            // P(0 hrs) = 2 * lastClosingPrice, P(6 hrs) = lastClosingPrice, P(>=24 hrs) = 0

            // 10^5 * 10^31 = 10^36
            price.num = atleastZero(int((86400 - timeElapsed) * averagedPrice.num));
            // 10^6 * 10^31 = 10^37
            price.den = (timeElapsed + 43200) * averagedPrice.den;

            if (price.num * sellVolumesCurrent[sellToken][buyToken] <= price.den * buyVolumes[sellToken][buyToken]) {
                price.num = buyVolumes[sellToken][buyToken];
                price.den = sellVolumesCurrent[sellToken][buyToken];
            }
        }
    }

    // > depositAndSell()
    function depositAndSell(
        address sellToken,
        address buyToken,
        uint amount
    )
        public
    {
        deposit(sellToken, amount);
        postSellOrder(sellToken, buyToken, 0, amount);
    }

    // > claimAndWithdraw()
    function claimAndWithdraw(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex,
        uint amount
    )
        public
    {
        claimSellerFunds(sellToken, buyToken, user, auctionIndex);
        withdraw(buyToken, amount);
    }

    // > External fns
    // > getFeeRatioExt
    function getFeeRatioExt(
        address user
    )
        public
        view
        returns (uint, uint)
    {
        fraction memory feeRatio = getFeeRatio(user);
        return (feeRatio.num, feeRatio.den);
    }

    // > getPriceOfTokenInLastAuctionExt
    function getPriceOfTokenInLastAuctionExt(
        address token
    )
        public
        view
        returns (uint, uint) 
    {
        fraction memory price = getPriceOfTokenInLastAuction(token);
        return (price.num, price.den);
    }
    function getPriceInPastAuctionExt(
        address token1,
        address token2,
        uint auctionIndex
    )
        public
        view
        returns (uint, uint) 
    {
        fraction memory price = getPriceInPastAuction(token1, token2, auctionIndex);
        return (price.num, price.den);
    }

    // > getCurrentAuctionPriceExt()
    function getCurrentAuctionPriceExt(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        view
        returns (uint, uint) 
    {
        fraction memory price = getCurrentAuctionPrice(sellToken, buyToken, auctionIndex);
        return (price.num, price.den);
    }

    // > helper fns
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
        auctionStarts[token1][token2] = now + value;
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

    function getRunningTokenPairs(
        address[] tokens
    )
        public
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
    function getIndicesWithClaimableTokens(
        address auctionSellToken,
        address auctionBuyToken,
        address user,
        uint lastNAuctions
    )
        public
        view
        returns(uint[] indices, uint[] balances)
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
        balances = new uint[](arrayLength);

        uint k;

        for (uint i = 1; i <= runningAuctionIndex; i++) {
            if (sellerBalances[auctionSellToken][auctionBuyToken][i][user] > 0) {
                indices[k] = i;
                balances[k] = sellerBalances[auctionSellToken][auctionBuyToken][i][user];
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
        public
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

    //@dev for multiple withdraws
    //@param auctionSellTokens are the sellTokens defining an auctionPair
    //@param auctionBuyTokens are the buyTokens defining an auctionPair
    //@param auctionIndices are the auction indices on which an token should be claimedAmounts
    //@param user is the user who wants to his tokens
    function claimTokensFromSeveralAuctions(
        address[] auctionSellTokens,
        address[] auctionBuyTokens,
        uint[] auctionIndices,
        address user
    )
        public
    {
        for (uint i = 0; i < auctionSellTokens.length; i++)
            claimSellerFunds(auctionSellTokens[i], auctionBuyTokens[i], user, auctionIndices[i]);
    }

    // > Events
    event NewDeposit(
         address token,
         uint amount
    );

    event NewWithdrawal(
        address token,
        uint amount
    );
    
    event NewSellOrder(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex,
        uint amount
    );

    event NewBuyOrder(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex,
        uint amount
    );

    event NewSellerFundsClaim(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex,
        uint amount,
        uint frtsIssued
    );

    event NewBuyerFundsClaim(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex,
        uint amount,
        uint frtsIssued
    );

    event NewTokenPair(
        address sellToken,
        address buyToken
    );

    event AuctionCleared(
        address sellToken,
        address buyToken,
        uint sellVolume,
        uint buyVolume,
        uint auctionIndex
    );
}