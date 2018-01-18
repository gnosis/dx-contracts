pragma solidity ^0.4.18;

import "./Utils/Math.sol";
import "./Tokens/Token.sol";
import "./Tokens/TokenTUL.sol";
import "./Tokens/TokenOWL.sol";
import "./Oracle/PriceOracleInterface.sol";  

/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Dominik Teiml - <dominik@gnosis.pm>

contract DutchExchange {
    using Math for *;
    
    // The price is a rational number, so we need a concept of a fraction
    struct fraction {
        uint num;
        uint den;
    }

    // > Storage
    address public owner;
    // Ether ERC-20 token
    address public ETH;
    address public ETHUSDOracle;
    // Minimum required sell funding for adding a new token pair, in USD
    uint public thresholdNewTokenPair;
    // Minimum required sell funding for starting antoher auction, in USD
    uint public thresholdNewAuction;
    address public TUL;
    address public OWL;

    // Token => approved
    // Only tokens approved by owner generate TUL tokens
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
    modifier onlyOwner() {
        // R1
        // require(msg.sender == owner);
        if (msg.sender != owner) {
            Log('onlyOwner R1');
            return;
        }

        _;
    }

    /// @dev Constructor creates exchange
    /// @param _TUL - address of TUL ERC-20 token
    /// @param _OWL - address of OWL ERC-20 token
    /// @param _owner - owner for managing interfaces
    /// @param _ETH - address of ETH ERC-20 token
    /// @param _ETHUSDOracle - address of the oracle contract for fetching feeds
    /// @param _thresholdNewTokenPair - Minimum required sell funding for adding a new token pair, in USD
    function DutchExchange(
        address _TUL,
        address _OWL,
        address _owner, 
        address _ETH,
        address _ETHUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
        public
    {
        TUL = _TUL;
        OWL = _OWL;
        owner = _owner;
        ETH = _ETH;
        ETHUSDOracle = _ETHUSDOracle;
        thresholdNewTokenPair = _thresholdNewTokenPair;
        thresholdNewAuction = _thresholdNewAuction;
    }

    function updateExchangeParams(
        address _owner,
        address _ETHUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
        public
        onlyOwner()
    {
        owner = _owner;
        ETHUSDOracle = _ETHUSDOracle;
        thresholdNewTokenPair = _thresholdNewTokenPair;
        thresholdNewAuction = _thresholdNewAuction;
    }

    function updateApprovalOfToken(
        address token,
        bool approved
    )
        public
        onlyOwner()
     {   
        approvedTokens[token] = approved;
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
        // require(token1 != token2);
        if (token1 == token2) {
            Log('addTokenPair R1');
            return;
        }
        // R2
        // require(initialClosingPriceNum != 0);
        if (initialClosingPriceNum == 0) {
            Log('addTokenPair R2');
            return;
        }
        // R3
        // require(initialClosingPriceDen != 0);
        if (initialClosingPriceDen == 0) {
            Log('addTokenPair R3');
            return;
        }
        // R4
        // require(getAuctionIndex(token1, token2) == 0);
        if (getAuctionIndex(token1, token2) != 0) {
            Log('addTokenPair R4');
            return;
        }

        setAuctionIndex(token1, token2);

        token1Funding = Math.min(token1Funding, balances[token1][msg.sender]);
        token2Funding = Math.min(token2Funding, balances[token2][msg.sender]);

        uint fundedValueUSD;
        uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();

        // Compute fundedValueUSD
        if (token1 == ETH) {
            // C1
            fundedValueUSD = token1Funding * ETHUSDPrice;
        } else if (token2 == ETH) {
            // C2
            fundedValueUSD = token2Funding * ETHUSDPrice;
        } else {
            // C3: Neither token is ETH
            // We require there to exist ETH-Token auctions
            // R3.1
            // require(getAuctionIndex(token1, ETH) > 0);
            if (getAuctionIndex(token1, ETH) == 0) {
                Log('addTokenPair R3.1');
                return;
            }
            // R3.2
            // require(getAuctionIndex(token2, ETH) > 0);
            if (getAuctionIndex(token2, ETH) == 0) {
                Log('addTokenPair R3.2');
                return;
            }

            // Price of Token 1
            fraction memory priceToken1 = priceOracle(token1);

            // Price of Token 2
            fraction memory priceToken2 = priceOracle(token2);

            // Compute funded value in ETH and USD
            uint fundedValueETH = token1Funding * priceToken1.num / priceToken1.den + token2Funding * priceToken2.num / priceToken2.den;
            fundedValueUSD = fundedValueETH * ETHUSDPrice;
        }

        // R5
        // require(fundedValueUSD >= thresholdNewTokenPair);
        if (fundedValueUSD < thresholdNewTokenPair) {
            Log('addTokenPair R5');
            return;
        }

        if (token1 == ETH || token2 == ETH) {
            // Save prices of opposite auctions
            closingPrices[token1][token2][0] = fraction(initialClosingPriceNum, initialClosingPriceDen);
            closingPrices[token2][token1][0] = fraction(initialClosingPriceDen, initialClosingPriceNum);
        } else {
            closingPrices[token1][token2][0] = fraction(priceToken2.num * priceToken1.den, priceToken2.den * priceToken1.num);
            closingPrices[token2][token1][0] = fraction(priceToken2.den * priceToken1.num, priceToken2.num * priceToken1.den);
        }

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
        
        setAuctionStart(token1, token2, 6 hours);
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
        // require(Token(tokenAddress).transferFrom(msg.sender, this, amount));
        if (!Token(tokenAddress).transferFrom(msg.sender, this, amount)) {
            Log('deposit R1');
            return;
        }
        balances[tokenAddress][msg.sender] += amount;
        // NewDeposit(tokenAddress, amount);
    }

    // > withdraw()
    function withdraw(
        address tokenAddress,
        uint amount
    )
        public
    {
        // R1
        amount = Math.min(amount, balances[tokenAddress][msg.sender]);
        // require(amount > 0);
        if (amount == 0) {
            Log('withdraw R1');
            return;
        }

        balances[tokenAddress][msg.sender] -= amount;
        // R2
        // require(Token(tokenAddress).transfer(msg.sender, amount));
        if (!Token(tokenAddress).transfer(msg.sender, amount)) {
            Log('withdraw R2');
            return;
        }
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

        amount = Math.min(amount, balances[sellToken][msg.sender]);

        // R1
        // require(amount > 0);
        if (amount == 0) {
            Log('postSellOrder R1');
            return;
        }

        // R2
        uint latestAuctionIndex = getAuctionIndex(sellToken, buyToken);
        // require(latestAuctionIndex > 0);
        if (latestAuctionIndex == 0) {
            Log('postSellOrder R2');
            return;
        }

        // R3
        uint auctionStart = getAuctionStart(sellToken, buyToken);
        if (now < auctionStart || auctionStart == 1) {
            // C1: We are in the 10 minute buffer period
            // OR waiting for an auction to receive sufficient sellVolume
            // Auction has already cleared, and index has been incremented
            // sell order must use that auction index
            // R1.1
            if (auctionIndex == 0) {
                auctionIndex = latestAuctionIndex;
            }
            // require(auctionIndex == latestAuctionIndex); 
            if (auctionIndex != latestAuctionIndex) {
                Log('postSellOrder R1.1');
                return;
            }
        } else {
            // C2
            // R2.1: Sell orders must go to next auction
            if (auctionIndex == 0) {
                auctionIndex = latestAuctionIndex + 1;
            }
            // require(auctionIndex == latestAuctionIndex + 1);
            if (auctionIndex != latestAuctionIndex + 1) {
                Log('postSellOrder R2.1');
                return;
            }
        }

        // Fee mechanism, fees are added to extraTokens
        uint amountAfterFee = settleFee(sellToken, buyToken, auctionIndex, msg.sender, amount);

        // Update variables
        balances[sellToken][msg.sender] -= amount;
        sellerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
        if (now < auctionStart || auctionStart == 1) {
            // C1
            sellVolumesCurrent[sellToken][buyToken] += amountAfterFee;
        } else {
            // C2
            sellVolumesNext[sellToken][buyToken] += amountAfterFee;
        }

        if (auctionStart == 1) {
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

        // R4: auction must not have cleared
        // require(closingPrices[sellToken][buyToken][auctionIndex].den == 0);
        if (closingPrices[sellToken][buyToken][auctionIndex].den > 0) {
            Log('postBuyOrder R4');
            return;
        }

        // R1
        // require(getAuctionStart(sellToken, buyToken) <= now);
        if (auctionStart > now) {
            Log('postBuyOrder R1');
            return;
        }
        // R3
        // require(auctionIndex == getAuctionIndex(sellToken, buyToken));
        if (auctionIndex != getAuctionIndex(sellToken, buyToken)) {
            Log('postBuyOrder R3');
            return;
        }

        // R5: auction must not be in waiting period
        // require(auctionStart > 1);
        if (auctionStart <= 1) {
            Log('postBuyOrder R5');
            return;
        }

        amount = Math.min(amount, balances[buyToken][msg.sender]);
        
        // Overbuy is when a part of a buy order clears an auction
        // In that case we only process the part before the overbuy
        // To calculate overbuy, we first get current price
        uint sellVolume = sellVolumesCurrent[sellToken][buyToken];
        uint buyVolume = buyVolumes[sellToken][buyToken];
        fraction memory price = getPrice(sellToken, buyToken, auctionIndex);
        uint outstandingVolume = Math.atleastZero(int(sellVolume * price.num / price.den - buyVolume));

        uint amountAfterFee;
        if (amount < outstandingVolume) {
            if (amount > 0) {
                amountAfterFee = settleFee(buyToken, sellToken, auctionIndex, msg.sender, amount);
            }
        } else {
            amount = outstandingVolume;
            amountAfterFee = outstandingVolume;
        }

        // Here we could also use outstandingVolume or amount, it doesn't matter
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
        returns (uint returned, uint tulipsIssued)
    {
        uint sellerBalance = sellerBalances[sellToken][buyToken][auctionIndex][user];

        // R1
        // require(sellerBalance > 0);
        if (sellerBalance == 0) {
            Log('claimSellerFunds R1');
            return;
        }

        // Get closing price for said auction
        fraction memory closingPrice = closingPrices[sellToken][buyToken][auctionIndex];
        uint num = closingPrice.num;
        uint den = closingPrice.den;

        // R2: require auction to have cleared
        // require(den > 0);
        if (den == 0) {
            Log('claimSellerFunds R2');
            return;
        }

        // Calculate return
        returned = sellerBalance * num / den;

        // Get tulips issued based on ETH price of returned tokens
        if (approvedTokens[sellToken] == true && approvedTokens[buyToken] == true) {
            if (sellToken == ETH) {
                tulipsIssued = sellerBalance;
            } else if (buyToken == ETH) {
                tulipsIssued = returned;
            } else {
                // Neither token is ETH, so we use priceOracle()
                // priceOracle() depends on latestAuctionIndex
                // i.e. if a user claims tokens later in the future,
                // he/she is likely to get slightly different number
                fraction memory price = historicalPriceOracle(sellToken, auctionIndex);
                tulipsIssued = sellerBalance * price.num / price.den;
            }

            // Issue TUL
            TokenTUL(TUL).mintTokens(user, tulipsIssued);
        }

        // Claim tokens
        sellerBalances[sellToken][buyToken][auctionIndex][user] = 0;
        balances[buyToken][user] += returned;
        NewSellerFundsClaim(sellToken, buyToken, user, auctionIndex, returned);
    }

    // > claimBuyerFunds()
    function claimBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        returns (uint returned, uint tulipsIssued)
    {
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
            uint tokensExtra = buyerBalance * extraTokensTotal / closingPrices[sellToken][buyToken][auctionIndex].num;
            returned += tokensExtra;

            if (approvedTokens[buyToken] == true && approvedTokens[sellToken] == true) {
                // Get tulips issued based on ETH price of returned tokens
                if (buyToken == ETH) {
                    tulipsIssued = buyerBalance;
                } else if (sellToken == ETH) {
                    tulipsIssued = buyerBalance * price.den / price.num;
                } else {
                    // Neither token is ETH, so we use historicalPriceOracle()
                    fraction memory priceETH = historicalPriceOracle(buyToken, auctionIndex);
                    tulipsIssued = buyerBalance * priceETH.num / priceETH.den;
                }

                if (tulipsIssued > 0) {
                    // Issue TUL
                    TokenTUL(TUL).mintTokens(user, tulipsIssued);
                }
            }

            // Auction has closed
            // Reset buyerBalances and claimedAmounts
            buyerBalances[sellToken][buyToken][auctionIndex][user] = 0;
            claimedAmounts[sellToken][buyToken][auctionIndex][user] = 0; 
        }

        // Claim tokens
        balances[sellToken][user] += returned;
        NewBuyerFundsClaim(sellToken, buyToken, user, auctionIndex, returned);
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
        constant
        returns (uint unclaimedBuyerFunds, fraction memory price)
    {
        // R1: checks if particular auction has ever run
        // require(auctionIndex <= getAuctionIndex(sellToken, buyToken));
        if (auctionIndex > getAuctionIndex(sellToken, buyToken)) {
            Log('getUnclaimedBuyerFunds R1');
            return;
        }

        price = getPrice(sellToken, buyToken, auctionIndex);

        if (price.num == 0) {
            // This should rarely happen - as long as there is >= 1 buy order,
            // auction will clear before price = 0. So this is just fail-safe
            unclaimedBuyerFunds = 0;
        } else {
            uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];
            unclaimedBuyerFunds = buyerBalance * price.den / price.num - claimedAmounts[sellToken][buyToken][auctionIndex][user];
        }
    }

    // > getPrice()
    function getPrice(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        constant
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
            fraction memory ratioOfPriceOracles = computeRatioOfHistoricalPriceOracles(sellToken, buyToken, auctionIndex);

            // If we're calling the function into an unstarted auction,
            // it will return the starting price of that auction
            uint timeElapsed = Math.atleastZero(int(now - getAuctionStart(sellToken, buyToken)));

            // The numbers below are chosen such that
            // P(0 hrs) = 2 * lastClosingPrice, P(6 hrs) = lastClosingPrice, P(>=24 hrs) = 0

            price.num = Math.atleastZero(int((86400 - timeElapsed) * ratioOfPriceOracles.num));
            price.den = (timeElapsed + 43200) * ratioOfPriceOracles.den;

            if (price.num * sellVolumesCurrent[sellToken][buyToken] <= price.den * buyVolumes[sellToken][buyToken]) {
                price.num = buyVolumes[sellToken][buyToken];
                price.den = sellVolumesCurrent[sellToken][buyToken];
            }
        }
    }

    // > getPriceForJs()
    function getPriceForJS(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
    public
    constant
    returns (uint, uint) 
    {
        fraction memory price = getPrice(sellToken, buyToken, auctionIndex);
        return (price.num, price.den);
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
        // Get variables & Update closing prices
        uint buyVolume = buyVolumes[sellToken][buyToken];
        closingPrices[sellToken][buyToken][auctionIndex] = fraction(buyVolume, sellVolume);
        fraction memory opp = closingPrices[buyToken][sellToken][auctionIndex];

        // Logic so tokens don't get stuck in auctions where clearing price was 0
        uint sellVolumeNext = sellVolumesNext[sellToken][buyToken];
        if (buyVolume == 0) {
            extraTokens[sellToken][buyToken][auctionIndex + 1] = extraTokens[sellToken][buyToken][auctionIndex];
            extraTokens[sellToken][buyToken][auctionIndex] = 0;
            if (sellVolume > 0) {
                sellVolumeNext += sellVolume;
            }
        }

        uint sellVolumeOpp = sellVolumesCurrent[buyToken][sellToken];
        // if (opposite is zero auction OR opposite auction has cleared) {
        if (sellVolumeOpp == 0 || opp.den > 0) {
            if (sellVolumeOpp == 0) {
                extraTokens[buyToken][sellToken][auctionIndex + 1] += extraTokens[buyToken][sellToken][auctionIndex];
                extraTokens[buyToken][sellToken][auctionIndex] = 0;
                AuctionCleared(buyToken, sellToken, 0, 0, auctionIndex);
            }

            // Update state variables for both auctions
            sellVolumesCurrent[sellToken][buyToken] = sellVolumeNext;
            sellVolumesNext[sellToken][buyToken] = 0;
            buyVolumes[sellToken][buyToken] = 0;

            sellVolumesCurrent[buyToken][sellToken] = sellVolumesNext[buyToken][sellToken];
            sellVolumesNext[buyToken][sellToken] = 0;
            buyVolumes[buyToken][sellToken] = 0;

            // Increment auction index
            setAuctionIndex(sellToken, buyToken);
            // Check if next auction can be scheduled
            scheduleNextAuction(sellToken, buyToken);
        }

        AuctionCleared(sellToken, buyToken, sellVolume, buyVolume, auctionIndex);
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
        returns (uint amountAfterFee)
    {
        fraction memory feeRatio = calculateFeeRatio(user);
        uint fee = amount * feeRatio.num / feeRatio.den;

        if (fee > 0) {
            // Allow user to reduce up to half of the fee with OWL
            uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();
            fraction memory price = priceOracle(primaryToken);

            // Convert fee to ETH, then USD
            uint feeInETH = fee * price.num / price.den;
            uint feeInUSD = feeInETH * ETHUSDPrice;
            uint amountOfOWLBurned = Math.min(balances[OWL][msg.sender], feeInUSD / 2);

            if (amountOfOWLBurned > 0) {
                balances[OWL][msg.sender] -= amountOfOWLBurned;
                TokenOWL(OWL).burnOWL(amountOfOWLBurned);

                // Adjust fee
                fee -= amountOfOWLBurned * fee / feeInUSD;
            }

            extraTokens[primaryToken][secondaryToken][auctionIndex + 1] += fee;
        }

        amountAfterFee = amount - fee;
    }

    // > calculateFeeRatio()
    function calculateFeeRatio(
        address user
    )
        public
        view
        returns (fraction memory feeRatio)
    {
        uint totalTUL = TokenTUL(TUL).totalTokens();

        // The fee function is chosen such that
        // F(0) = 0.5%, F(1%) = 0.25%, F(>=10%) = 0
        // (Takes in a amount of user's TUL tokens as ration of all TUL tokens, outputs fee ratio)
        // We premultiply by amount to get fee:
        if (totalTUL > 0) {
            uint balanceOfTUL = TokenTUL(TUL).lockedTULBalances(user);
            feeRatio.num = Math.atleastZero(int(totalTUL - 10 * balanceOfTUL));
            feeRatio.den = 16000 * balanceOfTUL + 200 * totalTUL;
        } else {
            feeRatio.num = 1;
            feeRatio.den = 200;
        }
    }

    // > scheduleNextAuction()
    function scheduleNextAuction(
        address sellToken,
        address buyToken
    )
        internal
    {
        // Check if auctions received enough sell orders
        uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();
        fraction memory priceTs = priceOracle(sellToken);
        fraction memory priceTb = priceOracle(buyToken);

        // We use current sell volume, because in clearAuction() we set
        // sellVolumesCurrent = sellVolumesNext before calling this function
        // (this is so that we don't need case work,
        // since it might also be called from postSellOrder())

        uint sellVolume = sellVolumesCurrent[sellToken][buyToken] * priceTs.num * ETHUSDPrice / priceTs.den;
        uint sellVolumeOpp = sellVolumesCurrent[buyToken][sellToken] * priceTb.num * ETHUSDPrice / priceTb.den;
        if (sellVolume >= thresholdNewAuction || sellVolumeOpp >= thresholdNewAuction) {
            // Schedule next auction
            setAuctionStart(sellToken, buyToken, 10 minutes);
        } else {
            resetAuctionStart(sellToken, buyToken);
        }
    }

    // > computeRatioOfHistoricalPriceOracles()
    function computeRatioOfHistoricalPriceOracles(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        constant
        returns (fraction memory price)
    {
        fraction memory sellTokenPrice = historicalPriceOracle(sellToken, auctionIndex);
        fraction memory buyTokenPrice = historicalPriceOracle(buyToken, auctionIndex);

        price.num = sellTokenPrice.num * buyTokenPrice.den;
        price.den = sellTokenPrice.den * buyTokenPrice.num;
    }

    // > historicalPriceOracle()
    function historicalPriceOracle(
        address token,
        uint auctionIndex
    )
        public
        constant
        returns (fraction memory price)
    {
        if (token == ETH) {
            // C1
            price.num = 1;
            price.den = 1;
        } else {
            // C2
            // R2.1
            // require(auctionIndex > 0);
            if (auctionIndex == 0) {
                Log('historicalPriceOracle R2.1');
                return;
            }

            uint i = 0;
            bool correctPair = false;
            fraction memory closingPriceETH;
            fraction memory closingPriceToken;

            while (!correctPair) {
                i++;
                closingPriceETH = closingPrices[ETH][token][auctionIndex - i];
                closingPriceToken = closingPrices[token][ETH][auctionIndex - i];

                // Since if den is 0, num is 0, if num > 0, den > 0
                if (closingPriceETH.num > 0 || closingPriceToken.num > 0) {
                    correctPair = true;
                }
            }

            // At this point at least one closing price is strictly positive
            // If only one is positive, we want to output that
            if (closingPriceETH.num == 0) {
                price.num = closingPriceToken.num;
                price.den = closingPriceToken.den;
            } else if (closingPriceToken.num == 0) {
                price.num = closingPriceETH.den;
                price.den = closingPriceETH.num;
            } else {
                // If both prices are positive, output weighted average
                price.num = closingPriceETH.den ** 2 * closingPriceToken.den + closingPriceToken.num ** 2 * closingPriceETH.num;
                price.den = closingPriceETH.num * closingPriceToken.den * (closingPriceETH.den + closingPriceToken.num);
            }
        } 
    }

    // > priceOracle()
    /// @dev Gives best estimate for market price of a token in ETH of any price oracle on the Ethereum network
    /// @param token address of ERC-20 token
    /// @return Weighted average of closing prices of opposite Token-ETH auctions, based on their sellVolume  
    function priceOracle(
        address token
    )
        public
        constant
        returns (fraction memory price)
    {
        uint latestAuctionIndex = getAuctionIndex(token, ETH);
        price = historicalPriceOracle(token, latestAuctionIndex);
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

    // > testing fns

    // > getPriceOracleForJs()
    function getPriceOracleForJS(
        address token
    )
    public
    constant
    returns (uint, uint) 
    {
        fraction memory price = priceOracle(token);
        return (price.num, price.den);
    }

    function testing(address token)
    public
    returns(uint){
        fraction memory b=priceOracle(token);
        return b.num;
    }
    function testing2(address token1, address token2, uint index)
    public
    returns(uint){
        fraction memory b=getPrice(token1,token2, index);
        return b.num;
    }

    // > helper fns
    function getTokenOrder(
        address token1,
        address token2
    )
        public
        constant
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
        auctionStarts[token1][token2] = 1;
    }

    function getAuctionStart(
        address token1,
        address token2
    )
        public
        constant
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
        constant
        returns (uint auctionIndex) 
    {
        (token1, token2) = getTokenOrder(token1, token2);
        auctionIndex = latestAuctionIndices[token1][token2];
    }

    // > Events
    event NewDeposit(
         address indexed token,
         uint indexed amount
    );

    event NewWithdrawal(
        address indexed token,
        uint indexed amount
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
        uint amount
    );

    event NewBuyerFundsClaim(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount
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

    event Log(
        string l
    );

    event LogNumber(
        string l,
        uint n
    );
}