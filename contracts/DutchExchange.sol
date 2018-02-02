pragma solidity ^0.4.19;

import "./Tokens/TokenTUL.sol";
import "./Utils/Math2.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "@gnosis.pm/owl-token/contracts/OWLAirdrop.sol";
import "./Oracle/PriceOracleInterface.sol";  

/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Alex Herrmann - <alex@gnosis.pm>
/// @author Dominik Teiml - <dominik@gnosis.pm>

contract DutchExchange {
    using Math2 for *;
    
    // The price is a rational number, so we need a concept of a fraction
    struct fraction {
        uint num;
        uint den;
    }

    struct masterCopyCountdownType {
        DutchExchange masterCopy;
        uint timeWhenAvailable;
    }

    DutchExchange masterCopy;
    masterCopyCountdownType masterCopyCountdown;

    // > Storage
    address public auctioneer;
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
    // Only tokens approved by auctioneer generate TUL tokens
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

    bool public isInitialised;
    // > Modifiers
    modifier onlyAuctioneer() {
        // R1
        require(msg.sender == auctioneer);
        // if (msg.sender != auctioneer) {
        //     Log('onlyAuctioneer R1');
        //     return;
        // }
        _;
    }

    /// @dev Constructor-Function creates exchange
    /// @param _TUL - address of TUL ERC-20 token
    /// @param _OWL - address of OWL ERC-20 token
    /// @param _auctioneer - auctioneer for managing interfaces
    /// @param _ETH - address of ETH ERC-20 token
    /// @param _ETHUSDOracle - address of the oracle contract for fetching feeds
    /// @param _thresholdNewTokenPair - Minimum required sell funding for adding a new token pair, in USD
    function setupDutchExchange(
        address _TUL,
        address _OWL,
        address _auctioneer, 
        address _ETH,
        address _ETHUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
        public
    {
        require(!isInitialised);
        TUL = _TUL;
        OWL = _OWL;
        auctioneer = _auctioneer;
        ETH = _ETH;
        ETHUSDOracle = _ETHUSDOracle;
        thresholdNewTokenPair = _thresholdNewTokenPair;
        thresholdNewAuction = _thresholdNewAuction;
        isInitialised = true;
    }

    function updateExchangeParams(
        address _auctioneer,
        address _ETHUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
        public
        onlyAuctioneer()
    {
        auctioneer = _auctioneer;
        ETHUSDOracle = _ETHUSDOracle;
        thresholdNewTokenPair = _thresholdNewTokenPair;
        thresholdNewAuction = _thresholdNewAuction;
    }

    function updateApprovalOfToken(
        address token,
        bool approved
    )
        public
        onlyAuctioneer()
     {   
        approvedTokens[token] = approved;
     }

     function startMasterCopyCountdown (
        DutchExchange _masterCopy
     )
        public
        onlyAuctioneer()
    {
        require(address(_masterCopy) != 0);

        // Update masterCopyCountdown
        masterCopyCountdown.masterCopy = _masterCopy;
        masterCopyCountdown.timeWhenAvailable = now + 30 days;
    }

    function updateMasterCopy()
        public
        onlyAuctioneer()
    {
        require(address(masterCopyCountdown.masterCopy) != 0);
        require(now >= masterCopyCountdown.timeWhenAvailable);

        // Update masterCopy
        masterCopy = masterCopyCountdown.masterCopy;
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


        setAuctionIndex(token1, token2);

        token1Funding = Math2.min(token1Funding, balances[token1][msg.sender]);
        token2Funding = Math2.min(token2Funding, balances[token2][msg.sender]);

        // R7
        require(token1Funding < 10 ** 30);
        // if (token1Funding >= 10 ** 30) {
        //     Log('addTokenPair R7');
        //     return;
        // }

        // R8
        require(token2Funding < 10 ** 30);
        // if (token2Funding >= 10 ** 30) {
        //     Log('addTokenPair R8');
        //     return;
        // }

        uint fundedValueUSD;
        uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();

        // Compute fundedValueUSD
        address ETHmem = ETH;
        if (token1 == ETHmem) {
            // C1
            // MUL: 10^30 * 10^4 = 10^34
            fundedValueUSD = token1Funding * ETHUSDPrice;
        } else if (token2 == ETHmem) {
            // C2
            // MUL: 10^30 * 10^4 = 10^34
            fundedValueUSD = token2Funding * ETHUSDPrice;
        } else {
            // C3: Neither token is ETH
            // We require there to exist ETH-Token auctions
            // R3.1
            require(getAuctionIndex(token1, ETH) > 0);

            // R3.2
            require(getAuctionIndex(token2, ETH) > 0);

            // Price of Token 1
            fraction memory priceToken1 = priceOracle(token1);

            // Price of Token 2
            fraction memory priceToken2 = priceOracle(token2);

            // Compute funded value in ETH and USD
            // 10^30 * 10^30 = 10^60
            fundedValueUSD = (token1Funding * priceToken1.num / priceToken1.den + 
                token2Funding * priceToken2.num / priceToken2.den) * ETHUSDPrice;
        }

        // R5
        require(fundedValueUSD >= thresholdNewTokenPair);

        // Save prices of opposite auctions
        closingPrices[token1][token2][0] = fraction(initialClosingPriceNum, initialClosingPriceDen);
        closingPrices[token2][token1][0] = fraction(initialClosingPriceDen, initialClosingPriceNum);

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
        require(Token(tokenAddress).transferFrom(msg.sender, this, amount));

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
        amount = Math2.min(amount, balances[tokenAddress][msg.sender]);
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

        amount = Math2.min(amount, balances[sellToken][msg.sender]);

        // R1
        require(amount > 0);
        
        // R2
        uint latestAuctionIndex = getAuctionIndex(sellToken, buyToken);
        require(latestAuctionIndex > 0);
      
        // R3
        uint auctionStart = getAuctionStart(sellToken, buyToken);
        if (auctionStart == 1 || auctionStart > now) {
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

        } else {
            // C2
            // R2.1: Sell orders must go to next auction
            if (auctionIndex == 0) {
                auctionIndex = latestAuctionIndex + 1;

            } else {
              require(auctionIndex == latestAuctionIndex + 1);
            }
        }

        // Fee mechanism, fees are added to extraTokens
        uint amountAfterFee = settleFee(sellToken, buyToken, auctionIndex, msg.sender, amount);

        // Update variables
        balances[sellToken][msg.sender] -= amount;
        sellerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
        if (auctionStart == 1 || auctionStart > now) {
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
        require(closingPrices[sellToken][buyToken][auctionIndex].den == 0);

        // R1
        require(getAuctionStart(sellToken, buyToken) <= now);
                // R3
        require(auctionIndex == getAuctionIndex(sellToken, buyToken));
        
        // R5: auction must not be in waiting period
        require(auctionStart > 1);
        
        // R6: auction must be funded
        require(sellVolumesCurrent[sellToken][buyToken] > 0);
        
        uint buyVolume = buyVolumes[sellToken][buyToken];
        amount = Math2.min(amount, balances[buyToken][msg.sender]);
        // R5
        require(buyVolume + amount < 10 ** 30);
        // if (buyVolume + amount >= 10 ** 30) {
        //     Log('postSellOrder R5');
        //     return;
        // }

        
        // Overbuy is when a part of a buy order clears an auction
        // In that case we only process the part before the overbuy
        // To calculate overbuy, we first get current price
        uint sellVolume = sellVolumesCurrent[sellToken][buyToken];
        fraction memory price = getPrice(sellToken, buyToken, auctionIndex);
        // 10^30 * 10^39 = 10^69
        uint outstandingVolume = Math2.atleastZero(int(sellVolume * price.num / price.den - buyVolume));

        LogOustandingVolume(outstandingVolume);

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
        returns (uint returned, uint tulipsIssued)
    {
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
        // 10^30 * 10^30 = 10^60
        returned = sellerBalance * num / den;

        // Get tulips issued based on ETH price of returned tokens
        if (approvedTokens[sellToken] == true && approvedTokens[buyToken] == true) {
            address ETHmem = ETH;
            if (sellToken == ETHmem) {
                tulipsIssued = sellerBalance;
            } else if (buyToken == ETHmem) {
                tulipsIssued = returned;
            } else {
                // Neither token is ETH, so we use priceOracle()
                // priceOracle() depends on latestAuctionIndex
                // i.e. if a user claims tokens later in the future,
                // he/she is likely to get slightly different number
                fraction memory price = historicalPriceOracle(sellToken, auctionIndex);
                // 10^30 * 10^30 = 10^60
                tulipsIssued = sellerBalance * price.num / price.den;
            }

            // Issue TUL
            if (tulipsIssued > 0) {
                TokenTUL(TUL).mintTokens(user, tulipsIssued);
            }
        }

        // Claim tokens
        sellerBalances[sellToken][buyToken][auctionIndex][user] = 0;
        if (returned > 0) {
            balances[buyToken][user] += returned;
        }
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
            // 10^30 * 10^30 = 10^60
            uint tokensExtra = buyerBalance * extraTokensTotal / closingPrices[sellToken][buyToken][auctionIndex].num;
            returned += tokensExtra;
 
            if (approvedTokens[buyToken] == true && approvedTokens[sellToken] == true) {
                address ETHmem = ETH;
                // Get tulips issued based on ETH price of returned tokens
                if (buyToken == ETHmem) {
                    tulipsIssued = buyerBalance;
                } else if (sellToken == ETHmem) {
                    // 10^30 * 10^39 = 10^66
                    tulipsIssued = buyerBalance * price.den / price.num;
                } else {
                    // Neither token is ETH, so we use historicalPriceOracle()
                    fraction memory priceETH = historicalPriceOracle(buyToken, auctionIndex);
                    // 10^30 * 10^28 = 10^58
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
        ClaimBuyerFunds(returned, tulipsIssued);
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
        returns (uint unclaimedBuyerFunds, fraction memory price)
    {
        // R1: checks if particular auction has ever run
        require(auctionIndex <= getAuctionIndex(sellToken, buyToken));

        price = getPrice(sellToken, buyToken, auctionIndex);

        if (price.num == 0) {
            // This should rarely happen - as long as there is >= 1 buy order,
            // auction will clear before price = 0. So this is just fail-safe
            unclaimedBuyerFunds = 0;
        } else {
            uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];
            // 10^30 * 10^39 = 10^69
            unclaimedBuyerFunds = Math2.atleastZero(int(
                buyerBalance * price.den / price.num - 
                claimedAmounts[sellToken][buyToken][auctionIndex][user]
            ));
        }
    }

    // > getPrice()
    function getPrice(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        view
        // price < 10^39
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
            uint timeElapsed = Math2.atleastZero(int(now - getAuctionStart(sellToken, buyToken)));

            // The numbers below are chosen such that
            // P(0 hrs) = 2 * lastClosingPrice, P(6 hrs) = lastClosingPrice, P(>=24 hrs) = 0

            // 10^4 * 10^35 = 10^39
            price.num = Math2.atleastZero(int((86400 - timeElapsed) * ratioOfPriceOracles.num));
            // 10^4 * 10^35 = 10^39
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
    view
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
        // 10^30 * 10^40 = 10^70
        // 10^70 / 10^41 = 10^29
        uint fee = amount * feeRatio.num / feeRatio.den;

        if (fee > 0) {
            // Allow user to reduce up to half of the fee with OWL
            uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();
            fraction memory price = priceOracle(primaryToken);

            // Convert fee to ETH, then USD
            // 10^29 * 10^30 / 10^30 = 10^29
            uint feeInETH = fee * price.num / price.den;

            // 10^29 * 10^4 = 10^33
            // Uses 18 decimal places <> exactly as OWL tokens: 10**18 OWL == 1 USD 
            uint feeInUSD = feeInETH * ETHUSDPrice;
            uint amountOfOWLBurned = Math2.min(balances[OWL][msg.sender], feeInUSD / 2);

            if (amountOfOWLBurned > 0) {
                balances[OWL][msg.sender] -= amountOfOWLBurned;
                TokenOWL(OWL).burnOWL(amountOfOWLBurned);

                // Adjust fee
                // 10^33 * 10^29 = 10^62
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
        // feeRatio < 10^40
        returns (fraction memory feeRatio)
    {
        uint totalTUL = TokenTUL(TUL).totalSupply();

        // The fee function is chosen such that
        // F(0) = 0.5%, F(1%) = 0.25%, F(>=10%) = 0
        // (Takes in a amount of user's TUL tokens as ration of all TUL tokens, outputs fee ratio)
        // We premultiply by amount to get fee:
        if (totalTUL > 0) {
            uint balanceOfTUL = TokenTUL(TUL).lockedTULBalances(user);
            feeRatio.num = Math2.atleastZero(int(totalTUL - 10 * balanceOfTUL));
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

        // 10^30 * 10^30 * 10^4 = 10^64
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
        view
        // price < 10^35
        returns (fraction memory price)
    {
        fraction memory sellTokenPrice = historicalPriceOracle(sellToken, auctionIndex);
        fraction memory buyTokenPrice = historicalPriceOracle(buyToken, auctionIndex);

        // 10^30 * 10^30 = 10^60
        price.num = sellTokenPrice.num * buyTokenPrice.den;
        price.den = sellTokenPrice.den * buyTokenPrice.num;

        while (price.num > 10 ** 12 && price.den > 10 ** 12) {
            price.num = price.num / 10 ** 6;
            price.den = price.den / 10 ** 6;
        }

        // R1
        require(price.num <= 10 ** 35 || price.den <= 10 ** 35);
        // if (price.num > 10 ** 35 || price.den > 10 ** 35) {
        //     Log('computeRatioOfHistoricalPriceOracles R1');
        //     return;
        // }
    }

    // > historicalPriceOracle()
    function historicalPriceOracle(
        address token,
        uint auctionIndex
    )
        public
        view
        // price < 10^30
        returns (fraction memory price)
    {
        address ETHmem = ETH;
        if (token == ETHmem) {
            // C1
            price.num = 1;
            price.den = 1;
        } else {
            // C2
            // R2.1
            require(auctionIndex > 0);

            uint i = 0;
            bool correctPair = false;
            fraction memory closingPriceETH;
            fraction memory closingPriceToken;

            while (!correctPair) {
                i++;
                closingPriceETH = closingPrices[ETHmem][token][auctionIndex - i];
                closingPriceToken = closingPrices[token][ETHmem][auctionIndex - i];
                
                if (closingPriceETH.num > 0 && closingPriceETH.den > 0 || 
                    closingPriceToken.num > 0 && closingPriceToken.den > 0)
                {
                    correctPair = true;
                }
            }

            // At this point at least one closing price is strictly positive
            // If only one is positive, we want to output that
            if (closingPriceETH.num == 0 || closingPriceETH.den == 0) {
                price.num = closingPriceToken.num;
                price.den = closingPriceToken.den;
            } else if (closingPriceToken.num == 0 || closingPriceToken.den == 0) {
                price.num = closingPriceETH.den;
                price.den = closingPriceETH.num;
            } else {
                // If both prices are positive, output weighted average
                price.num = closingPriceETH.den + closingPriceToken.num;
                price.den = closingPriceETH.num + closingPriceToken.den;
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
        view
        // price < 10^30
        returns (fraction memory price)
    {
        uint latestAuctionIndex = getAuctionIndex(token, ETH);
        // historicalPriceOracle < 10^30
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
    view
    returns (uint, uint) 
    {
        fraction memory price = priceOracle(token);
        return (price.num, price.den);
    }

    // > historicalPriceOracleForJs()
    function historicalPriceOracleForJS(
        address token,
        uint auctionIndex
    )
    public
    constant
    returns (uint, uint) 
    {
        fraction memory price = historicalPriceOracle(token, auctionIndex);
        return (price.num, price.den);
    }

     // > getPriceOracleForJs()
    function computeRatioOfHistoricalPriceOraclesForJS(
        address tokenA,
        address tokenB,
        uint auctionIndex
    )
    public
    constant
    returns (uint, uint) 
    {
        fraction memory price = computeRatioOfHistoricalPriceOracles(tokenA, tokenB, auctionIndex);
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
        if (auctionStarts[token1][token2] != 1) {
            auctionStarts[token1][token2] = 1;
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

    event LogOustandingVolume(
        uint l
    );

    event LogNumber(
        string l,
        uint n
    );

    event ClaimBuyerFunds (
        uint returned,
        uint tulipsIssued
    );
}