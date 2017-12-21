pragma solidity 0.4.18;

import "./Utils/Math.sol";
import "./Tokens/Token.sol";
import "./Tokens/TokenTUL.sol";
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

    // We define a "token combination" to be a token tuple where order doesn't matter,
    // And "token pair" to be a tuple where order matters.
    // The following three mappings are for a token combination
    // The specific order depends on the order of the arguments passed to addTokenPair() (see below) 
    // Token => Token => index
    mapping (address => mapping (address => uint)) public latestAuctionIndices;
    // Token => Token => time
    mapping (address => mapping (address => uint)) public auctionStarts;
    // Token => Token => amount
    mapping (address => mapping (address => uint)) public arbTokensAdded;

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

    // Events
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
        address indexed sellToken,
        address indexed buyToken
    );

    event AuctionCleared(
        address indexed sellToken,
        address indexed buyToken,
        uint indexed auctionIndex
    );

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner);
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

        token1Funding = Math.min(token1Funding, balances[token1][msg.sender]);
        token2Funding = Math.min(token2Funding, balances[token2][msg.sender]);

        uint fundedValueUSD;
        uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();

        // Compute fundedValueUSD
        if (token1 == ETH) {
            fundedValueUSD = token1Funding * ETHUSDPrice;
        } else if (token2 == ETH) {
            fundedValueUSD = token2Funding * ETHUSDPrice;
        } else {
            // Neither token is ETH
            // We require there to exist ETH-Token auctions
            require(getAuctionIndex(token1, ETH) > 0);
            require(getAuctionIndex(token2, ETH) > 0);

            // Price of Token 1
            fraction memory priceToken1 = priceOracle(token1);

            // Price of Token 2
            fraction memory priceToken2 = priceOracle(token2);

            // Compute funded value in ETH and USD
            uint fundedValueETH = token1Funding * priceToken1.num / priceToken1.den + token2Funding * priceToken2.num / priceToken2.den;
            fundedValueUSD = fundedValueETH * ETHUSDPrice;
        }

        require(fundedValueUSD >= thresholdNewTokenPair);

        // Save prices of opposite auctions
        closingPrices[token1][token2][0] = fraction(initialClosingPriceNum, initialClosingPriceDen);
        closingPrices[token2][token1][0] = fraction(initialClosingPriceDen, initialClosingPriceNum);
        
        addTokenPair2(token1, token2, token1Funding, token2Funding);
    }

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
        uint feeToken1 = settleFee(token1, msg.sender, token1Funding);
        uint feeToken2 = settleFee(token2, msg.sender, token2Funding);
        extraTokens[token1][token2][1] = feeToken1;
        extraTokens[token2][token1][1] = feeToken2;

        uint token1FundingAfterFee = token1Funding - feeToken1;
        uint token2FundingAfterFee = token2Funding - feeToken2;

        // Update other variables
        sellVolumesCurrent[token1][token2] = token1FundingAfterFee;
        sellVolumesCurrent[token2][token1] = token2FundingAfterFee;
        sellerBalances[token1][token2][0][msg.sender] = token1FundingAfterFee;
        sellerBalances[token2][token1][0][msg.sender] = token2FundingAfterFee;
        
        setAuctionStart(token1, token2, 6 hours);
        NewTokenPair(token1, token2);
    }
    
    function deposit(
        address tokenAddress,
        uint amount
    )
        public
    {
        require(Token(tokenAddress).transferFrom(msg.sender, this, amount));
        balances[tokenAddress][msg.sender] += amount;
        NewDeposit(tokenAddress, amount);
    }

    function withdraw(
        address tokenAddress,
        uint amount
    )
        public
    {
        amount = Math.min(amount, balances[tokenAddress][msg.sender]);
        require(amount > 0);

        balances[tokenAddress][msg.sender] -= amount;
        require(Token(tokenAddress).transfer(msg.sender, amount));
        NewWithdrawal(tokenAddress, amount);
    }

    function postSellOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        public
    {
        amount = Math.min(amount, balances[sellToken][msg.sender]);
        // R1: amount mmust be > 0
        require(amount > 0);
        uint latestAuctionIndex = getAuctionIndex(sellToken, buyToken);
        uint auctionStart = getAuctionStart(sellToken, buyToken);

        if (now < auctionStart) {
            // C1: We are in the 10 minute buffer period
            // Auction has already cleared, and index has been incremented
            // R1.1: sell order must use that auction index
            require(auctionIndex == latestAuctionIndex);
        } else {
            // C2
            // R2.1: sell orders must go to next auction
            require(auctionIndex == latestAuctionIndex + 1);
        }

        // Fee mechanism, fees are added to extraTokens
        uint fee = settleFee(sellToken, msg.sender, amount);
        extraTokens[sellToken][buyToken][auctionIndex + 1] += fee;

        uint amountAfterFee = amount - fee;

        // Update variables
        balances[sellToken][msg.sender] -= amount;
        sellerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
        if (now < auctionStart) {
            // C1
            sellVolumesCurrent[sellToken][buyToken] += amountAfterFee;
        } else {
            // C2
            sellVolumesNext[sellToken][buyToken] += amountAfterFee;
        }

        // If there exist closing prices for both last auctions that means
        // an insfuficient sell volume was received in both auctions and trading has halted
        uint closingPriceDen = closingPrices[sellToken][buyToken][auctionIndex - 1].den;
        uint closingPriceDenOpp = closingPrices[buyToken][sellToken][auctionIndex - 1].den;
        if (getAuctionStart(sellToken, buyToken) < now && closingPriceDen > 0 && closingPriceDenOpp > 0) {
            scheduleNextAuction(sellToken, buyToken);
        }

        NewSellOrder(sellToken, buyToken, msg.sender, auctionIndex, amount);
    }

    function postBuyOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        public
    {
        // R1
        require(getAuctionStart(sellToken, buyToken) <= now);
        // R2
        require(auctionIndex == getAuctionIndex(sellToken, buyToken));
        // R3: auction must not have cleared
        require(closingPrices[sellToken][buyToken][auctionIndex].den == 0);

        amount = Math.min(amount, balances[buyToken][msg.sender]);
        
        // Overbuy is when a part of a buy order clears an auction
        // In that case we only process the part before the overbuy
        // To calculate overbuy, we first get current price
        fraction memory price = getPrice(sellToken, buyToken, auctionIndex);

        uint sellVolume = sellVolumesCurrent[sellToken][buyToken];
        uint buyVolume = buyVolumes[sellToken][buyToken];
        int overbuy = int(buyVolume + amountAfterFee - sellVolume * price.num / price.den);

        if (int(amountAfterFee) > overbuy) {
            // We must process the buy order
            if (overbuy > 0) {
                // We have to adjust the amountAfterFee
                amount -= uint(overbuy);
            }

            // Fee mechanism
            uint fee = settleFee(buyToken, msg.sender, amount);
            // Fees are always added to next auction
            extraTokens[buyToken][sellToken][auctionIndex + 1] += fee;
            uint amountAfterFee = amount - fee;

            // Update variables
            balances[buyToken][msg.sender] -= amount;
            buyerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
            buyVolumes[sellToken][buyToken] += amountAfterFee;
            NewBuyOrder(sellToken, buyToken, msg.sender, auctionIndex, amount);
        }

        if (overbuy >= 0) {
            // Clear auction
            clearAuction(sellToken, buyToken, auctionIndex, sellVolume);
        }

        if (now >= getAuctionStart(sellToken, buyToken) + 6 hours) {
            // Prices have crossed
            // We need to clear current or opposite auction
            closeCurrentOrOppositeAuction(
                sellToken,
                buyToken,
                auctionIndex,
                uint(-1 * overbuy),
                sellVolume
            );
        }
    }

    function closeCurrentOrOppositeAuction(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint outstandingVolume,
        uint sellVolume
    )
        internal
    {
        // Get variables
        uint sellVolumeOpp = sellVolumesCurrent[buyToken][sellToken];
        uint buyVolumeOpp = buyVolumes[buyToken][sellToken];
        // We have to compute the price at intersection time,
        // which will be exactly half of initial price
        fraction memory sellTokenPrice = priceOracle(sellToken);
        fraction memory buyTokenPrice = priceOracle(buyToken);
        fraction memory price;
        price.num = sellTokenPrice.num * buyTokenPrice.den;
        price.den =  sellTokenPrice.den * buyTokenPrice.num;
        uint outstandingVolumeOpp = sellVolumeOpp - buyVolumeOpp *  price.num / price.den;

        if (outstandingVolume <= outstandingVolumeOpp) {            
            // Increment buy volume of current & opposite auctions
            buyVolumes[sellToken][buyToken] += outstandingVolume;
            buyVolumes[buyToken][sellToken] += outstandingVolume * price.den / price.num;

            // Record number of tokens added
            setArbTokens(sellToken, buyToken, outstandingVolume * price.den / price.num);

            // Close current auction
            clearAuction(sellToken, buyToken, auctionIndex, sellVolume);
        } else {
            // Increment buy volume of current & opposite auctions 
            buyVolumes[sellToken][buyToken] += outstandingVolumeOpp;
            buyVolumes[buyToken][sellToken] += outstandingVolumeOpp * price.den / price.num;

            // Record number of tokens added
            setArbTokens(sellToken, buyToken, outstandingVolumeOpp);

            // Close opposite auction
            clearAuction(buyToken, sellToken, auctionIndex, sellVolume);
        }
    }

    function buy(
        address buyToken,
        address sellToken,
        uint amount,
        address from,
        address to,
        uint value,
        bytes data
    )
        public
    {
        Token(buyToken).transfer(msg.sender, amount);
        require(to.call.value(value)(data));
        uint maxAmount = Token(sellToken).allowance(msg.sender, this);
        require(Token(sellToken).transferFrom(msg.sender, this, maxAmount));
    }

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
                fraction memory price = priceOracle(buyToken);
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

    function claimBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        returns (uint returned, uint tulipsIssued)
    {
        uint tulipsToIssue;
        (returned, tulipsToIssue) = getUnclaimedBuyerFunds(sellToken, buyToken, user, auctionIndex);

        // R1
        require(returned > 0);

        if (auctionIndex == getAuctionIndex(sellToken, buyToken)) {
            // Auction is running
            claimedAmounts[sellToken][buyToken][auctionIndex][user] += returned;
        } else {
            // Auction has closed
            // Reset buyerBalances and claimedAmounts
            buyerBalances[sellToken][buyToken][auctionIndex][user] = 0;
            claimedAmounts[sellToken][buyToken][auctionIndex][user] = 0;

            // Assign extra sell tokens (this is possible only after auction has cleared,
            // because buyVolume could still increase before that)
            uint extraTokensTotal = extraTokens[sellToken][buyToken][auctionIndex];
            uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];
            uint tokensExtra = buyerBalance * extraTokensTotal / buyVolumes[sellToken][buyToken];
            returned += tokensExtra;
        }

        if (tulipsToIssue > 0) {
            // Issue TUL
            TokenTUL(TUL).mintTokens(user, tulipsIssued);
        }

        // Claim tokens
        balances[sellToken][user] += returned;
        NewBuyerFundsClaim(sellToken, buyToken, user, auctionIndex, returned);
    }

    /// @dev Claim buyer funds for one auction
    function getUnclaimedBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        constant
        returns (uint unclaimedBuyerFunds, uint tulipsToIssue)
    {
        // R1: checks if particular auction has ever run
        require(auctionIndex <= getAuctionIndex(sellToken, buyToken));

        uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];

        fraction memory price = getPrice(sellToken, buyToken, auctionIndex);

        if (price.num == 0) {
            // This should rarely happen - as long as there is >= 1 buy order,
            // auction will clear before price = 0. So this is just fail-safe
            unclaimedBuyerFunds = 0;
        } else {
            unclaimedBuyerFunds = buyerBalance * price.den / price.num - claimedAmounts[sellToken][buyToken][auctionIndex][user];
        }

        if (approvedTokens[buyToken] == true && approvedTokens[sellToken] == true) {
            // Get tulips issued based on ETH price of returned tokens
            if (buyToken == ETH) {
                tulipsToIssue = unclaimedBuyerFunds * price.num / price.den;
            } else if (sellToken == ETH) {
                tulipsToIssue = unclaimedBuyerFunds;
            } else {
                // Neither token is ETH, so we use priceOracle()
                // priceOracle() depends on latestAuctionIndex
                // i.e. if a user claims tokens later in the future,
                // he/she is likely to get slightly different number
                fraction memory priceETH = priceOracle(sellToken);
                tulipsToIssue = unclaimedBuyerFunds * priceETH.num / priceETH.den;
            }
        }
    }

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
            fraction memory sellTokenPrice = priceOracle(sellToken);
            fraction memory buyTokenPrice = priceOracle(buyToken);

            // If we're calling the function into an unstarted auction,
            // it will return the starting price of that auction
            uint timeElapsed = Math.max(0, now - getAuctionStart(sellToken, buyToken));

            // The numbers below are chosen such that
            // P(0 hrs) = 2 * lastClosingPrice, P(6 hrs) = lastClosingPrice, P(>=24 hrs) = 0
            price.num = Math.max(0, (86400 - timeElapsed) * sellTokenPrice.num * buyTokenPrice.den);
            price.den = (timeElapsed + 43200) * sellTokenPrice.den * buyTokenPrice.num;
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
        // Update closing prices
        uint buyVolume = buyVolumes[sellToken][buyToken];
        closingPrices[sellToken][buyToken][auctionIndex] = fraction(buyVolume, sellVolume);

        fraction memory opp = closingPrices[buyToken][sellToken][auctionIndex];

        // Closing price denominator is initialised as 0
        if (opp.den > 0) {
            // Denominator cannot be 0 once auction has cleared, so this means opposite auction has cleared

            // Get amount of tokens that were added through arbitration
            uint arbitrationTokensAdded = getArbTokens(sellToken, buyToken);

            if (arbitrationTokensAdded > 0) {
                // Add extra tokens from arbitration to extra tokens
                uint extraFromArb1 = sellVolume + buyVolumes[buyToken][sellToken];

                // Since this is the larger auction
                // It contains at least one buy order
                // Hence clearing price != 0
                // So dividing by clearingPriceNum doesn't break
                uint extraFromArb2 = (buyVolume - arbitrationTokensAdded) * sellVolume / buyVolume;
                extraTokens[sellToken][buyToken][auctionIndex] += extraFromArb1 - opp.num - extraFromArb2;
                resetArbTokens(sellToken, buyToken);
            }

            // In any case increment auction index and check if next auction can be scheduled
            setAuctionIndex(sellToken, buyToken);
            scheduleNextAuction(sellToken, buyToken);
        }

        // Update state variables
        sellVolumesCurrent[sellToken][buyToken] = sellVolumesNext[sellToken][buyToken];
        sellVolumesNext[sellToken][buyToken] = 0;
        buyVolumes[sellToken][buyToken] = 0;
        AuctionCleared(sellToken, buyToken, auctionIndex);
    }

    function settleFee(
        address token,
        address user,
        uint amount
    )
        internal
        returns (uint fee)
    {
        // Calculate fee based on proportion of all TUL tokens owned
        uint totalTUL = TokenTUL(TUL).totalTokens();
        uint balanceOfTUL = TokenTUL(TUL).lockedTULBalances(user);

        // The fee function is chosen such that
        // F(0) = 0.5%, F(1%) = 0.25%, F(>=10%) = 0
        // (Takes in a amount of user's TUL tokens as ration of all TUL tokens, outputs fee ratio)
        // We premultiply by amount to get fee:
        fee = Math.max(0, amount * (totalTUL - 10 * balanceOfTUL) / (16000 * balanceOfTUL + 200 * totalTUL));

        if (fee > 0) {
            // Allow user to reduce up to half of the fee with OWL
            uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();
            fraction memory price = priceOracle(token);

            // Convert fee to ETH, then USD
            uint feeInETH = fee * price.num / price.den;
            uint feeInUSD = feeInETH * ETHUSDPrice;
            uint amountOfOWLBurned = Math.min(Token(OWL).allowance(msg.sender, this), feeInUSD / 2);

            //burning OWL tokens with delegatecall is risky, because this allows OWL token to modify the storage of this contract.
            // OWL.delegatecall(bytes4(sha3("burnOWL(uint256)")), amount);

            // Adjust fee
            fee -= amountOfOWLBurned * fee / feeInUSD;
        }
    }

    function scheduleNextAuction(
        address sellToken,
        address buyToken
    )
        internal
    {
        // Check if auctions received enough sell orders
        uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();
        uint sellVolumeNext = sellVolumesNext[sellToken][buyToken] * ETHUSDPrice;
        uint sellVolumeNextOpp = sellVolumesNext[buyToken][sellToken] * ETHUSDPrice;
        if (sellVolumeNext >= thresholdNewAuction || sellVolumeNextOpp >= thresholdNewAuction) {
            // Schedule next auction
            setAuctionStart(sellToken, buyToken, 10 minutes);
        }
    }

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
        if (token == ETH) {
            price.num = 1;
            price.den = 1;
        } else {
            // Get variables
            uint auctionIndex = getAuctionIndex(token, ETH);
            fraction memory closingPriceETH = closingPrices[ETH][token][auctionIndex - 1];
            fraction memory closingPriceToken = closingPrices[token][ETH][auctionIndex - 1];

            // Compute weighted average
            uint numFirstPart = closingPriceETH.den ** 2 * closingPriceToken.den;
            uint numSecondPart = closingPriceToken.num ** 2 * closingPriceETH.num;
            price.num = numFirstPart + numSecondPart;
            price.den = closingPriceETH.num * closingPriceToken.den * (closingPriceETH.den + closingPriceToken.num);
        }
    }

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
        
        // R1
        require(latestAuctionIndices[token1][token2] > 0);

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

    function setArbTokens(
        address token1,
        address token2,
        uint amount
    )
        internal
    {
        (token1, token2) = getTokenOrder(token1, token2);
        arbTokensAdded[token1][token2] += amount;
    }

    function resetArbTokens(
        address token1,
        address token2
    )
        internal
    {
        (token1, token2) = getTokenOrder(token1, token2);
        arbTokensAdded[token1][token2] = 0;
    }

    function getArbTokens(
        address token1,
        address token2
    )
        public
        constant
        returns (uint arbTokens)
    {
        (token1, token2) = getTokenOrder(token1, token2);
        arbTokens = arbTokensAdded[token1][token2];
    }
}
