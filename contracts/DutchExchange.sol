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
    uint public sellFundingNewTokenPair;
    // Minimum required sell funding for renewing a token pair, in USD
    uint public treshholdForNewAuctionstart;
    address public TUL;
    address public OWL;
    address public priceOracleAddress;

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


    // Token => user => amount
    // balances stores a user's balance in the DutchX
    mapping (address => mapping (address => uint)) public balances;


    // Token => Token => auctionIndex => amount
    // We store historical values, because they are necessary to calculate extraTokens
    mapping (address => mapping (address => mapping (uint => uint))) public sellVolumes;
    mapping (address => mapping (address => mapping (uint => uint))) public buyVolumes;

    // Token => Token => auctionIndex => amount
    mapping (address => mapping (address => mapping (uint => uint))) public extraSellTokens;
    mapping (address => mapping (address => mapping (uint => uint))) public extraBuyTokens;

    // Token => Token =>  auctionIndex => user => amount
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public sellerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public buyerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public claimedAmounts;

    // Events
    event NewDeposit(
        address indexed token,
         uint indexed amount,
         address tokenAddress
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
    event AuctionCleared(address indexed sellToken, address indexed buyToken, uint indexed auctionIndex);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier existingToken(address token) {
        require(latestAuctionIndices[ETH][token] > 0);
        _;
    }

    /// @dev Constructor creates exchange
    /// @param _TUL - address of TUL ERC-20 token
    /// @param _OWL - address of OWL ERC-20 token
    /// @param _owner - owner for managing interfaces
    /// @param _ETH - address of ETH ERC-20 token
    /// @param _ETHUSDOracle - address of the oracle contract for fetching feeds
    /// @param _sellFundingNewTokenPair - Minimum required sell funding for adding a new token pair, in USD

    function DutchExchange(
        address _TUL,
        address _OWL,
        address _owner, 
        address _ETH,
        address _ETHUSDOracle,
        uint _sellFundingNewTokenPair,
        uint _treshholdForNewAuctionstart
    )
        public
    {
        TUL = _TUL;
        OWL = _OWL;
        owner = _owner;
        ETH = _ETH;
        ETHUSDOracle = _ETHUSDOracle;
        sellFundingNewTokenPair = _sellFundingNewTokenPair;
        treshholdForNewAuctionstart = _treshholdForNewAuctionstart;
    }
    
    

    function updateExchangeParams(
        address _owner,
        address _ETHUSDOracle,
        uint _sellFundingNewTokenPair,
        uint _treshholdForNewAuctionstart
    )
        public
        onlyOwner()
    {
        owner = _owner;
        ETHUSDOracle = _ETHUSDOracle;
        sellFundingNewTokenPair = _sellFundingNewTokenPair;
        treshholdForNewAuctionstart = _treshholdForNewAuctionstart;
    }

    function updateTULOwner(
        address _owner
    )
        public
        onlyOwner()
    {
        TokenTUL(TUL).updateOwner(_owner);
    }

    function updateApprovalOfToken(
        address token,
        bool approved)
    public
     {   
        approvedTokens[token] = approved;
     }

    function updateETHUSDPriceOracle(
        address _priceOracleAddress
    )
        public
        onlyOwner()
    {
        priceOracleAddress = _priceOracleAddress;
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
        //TODO 
        ///check that token has not already been added

        // Price can't be negative, 0, and has to be bounded
        require(initialClosingPriceNum != 0);
        require(initialClosingPriceDen != 0);

        // If we are adding or renewing a token pair, in both cases:
        require(latestAuctionIndices[token2][token1] == 0);

        uint fundedValueUSD;
        uint ETHUSDPrice = PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();
        uint latestAuctionIndex = latestAuctionIndices[token1][token2];

        // ETH-Token pairs must have ETH as first argument
        require(token2 != ETH);

        if (token1 == ETH) {
            fundedValueUSD = token1Funding * ETHUSDPrice;
        } else {
            // Neither token is ETH
            // We require there to exist ETH-Token auctions
            require(latestAuctionIndices[ETH][token1] > 0);
            require(latestAuctionIndices[ETH][token2] > 0);

            // Price of Token 1
            uint priceToken1Num;
            uint priceToken1Den;
            (priceToken1Num, priceToken1Den) = priceOracle(token1);

            // Price of Token 2
            uint priceToken2Num;
            uint priceToken2Den;
            (priceToken2Num, priceToken2Den) = priceOracle(token2);

            // Compute funded value in ETH and USD
            //uint fundedValueETH = token1Funding * priceToken1Num / priceToken1Den + token2Funding * priceToken2Num / priceToken2Den;
            fundedValueUSD = (token1Funding * priceToken1Num / priceToken1Den + token2Funding * priceToken2Num / priceToken2Den) * ETHUSDPrice;
        }

        // Now we can be sure it is a new pair
        require(fundedValueUSD >= sellFundingNewTokenPair);
        
        //transfering tokens
        require(balances[token1][msg.sender] >= token1Funding);
        require(balances[token2][msg.sender] >= token2Funding);
        
        balances[token1][msg.sender] -= token1Funding;
        balances[token2][msg.sender] -= token2Funding;


        // Save prices of opposite auctions
        closingPrices[token1][token2][latestAuctionIndex] = fraction(initialClosingPriceNum, initialClosingPriceDen);
        closingPrices[token2][token1][latestAuctionIndex] = fraction(initialClosingPriceDen, initialClosingPriceNum);

        // set fake volumes for first calculation of priceOracle
        sellVolumes[token1][token2][0] = initialClosingPriceNum;
        buyVolumes[token1][token2][0] = initialClosingPriceDen;
        sellVolumes[token2][token1][0] = initialClosingPriceDen;
        buyVolumes[token2][token1][0] = initialClosingPriceNum;

        // Update other variables
        sellVolumes[token1][token2][latestAuctionIndex + 1] = token1Funding;
        sellVolumes[token2][token1][latestAuctionIndex + 1] = token2Funding;
        sellerBalances[token1][token2][latestAuctionIndex+1][msg.sender] = token1Funding;
        sellerBalances[token2][token1][latestAuctionIndex+1][msg.sender] = token2Funding;
        
        latestAuctionIndices[token1][token2] += 1;
        auctionStarts[token1][token2] = now + 6 hours;
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
        NewDeposit(tokenAddress, amount, tokenAddress);
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

        // Amount mmust be > 0
        amount = Math.min(amount, balances[sellToken][msg.sender]);
        require(amount > 0);

        //uint latestAuctionIndex = latestAuctionIndices[token1][token2];
        if (now < auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)]) {
            // We are in the 10 minute buffer period (or 6 hours for new token pair)
            // Auction has already cleared, and index has been incremented
            // Sell order must use that auction index
            require(auctionIndex == latestAuctionIndices[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)]);
        } else {
            // check whether current auchtion has no starting date, because auctions have not been funded.
            if (auctionIndex == latestAuctionIndices[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)]){
                  require ( auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] == 1);
            } else {
                // Usual case required where you just post your sell order in the next auction.
                // Sell orders must go to next auction
                require(auctionIndex == latestAuctionIndices[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] + 1);
            }
        }

        // // Fee mechanism, fees are added to extraSellTokens
        uint fee = settleFee(sellToken, msg.sender, amount);
        // // Fees are added not to next starting auction, but to the auction after that
        extraSellTokens[sellToken][buyToken][auctionIndex + 1] += fee;

        uint amountAfterFee = amount - fee;

        // Update variables
        balances[sellToken][msg.sender] -= amount;
        sellerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
        sellVolumes[sellToken][buyToken][auctionIndex] += amountAfterFee;

       
        // check whether it is feasible to start a new auction:
        if (auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] == 1){
            if (PriceOracleInterface(ETHUSDOracle).getTokensValueInCENTS(sellToken, sellVolumes[sellToken][buyToken][auctionIndex]) > treshholdForNewAuctionstart || PriceOracleInterface(ETHUSDOracle).getTokensValueInCENTS(buyToken,sellVolumes[buyToken][sellToken][auctionIndex]) > treshholdForNewAuctionstart) {
                // Schedule next auction
                auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] = now + 10 minutes;
            }
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
        // Must be a valid token pair
        //address token1;
        //address token2;
        //bool validTokenPair;
        //(validTokenPair, token1, token2) = checkTokenPairAndOrder(sellToken, buyToken);
        //  require(validTokenPair);

        // Requirements
        require(auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] <= now);
        require(auctionIndex == latestAuctionIndices[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)]);

        amount = Math.min(amount, balances[buyToken][msg.sender]);


        // Fee mechanism
        //ToDo no amountOfWIZBurn 
        uint fee = settleFee(buyToken, msg.sender, amount);
        // Fees are always added to next auction
        extraBuyTokens[sellToken][buyToken][auctionIndex + 1] += fee;
        uint amountAfterFee = amount - fee;
        
        // Overbuy is when a part of a buy order clears an auction
        // In that case we only priceOracleAddress the part before the overbuy
        // To calculate overbuy, we first get current price
        uint num;
        uint den;
        (num, den) = getPrice(sellToken, buyToken, auctionIndex);

        //uint sellVolume = (sellVolumes[sellToken][buyToken][auctionIndex]);
        //uint buyVolume = buyVolumes[sellToken][buyToken][auctionIndex];
        int overbuy = int((buyVolumes[sellToken][buyToken][auctionIndex]) + amountAfterFee -
                        (sellVolumes[sellToken][buyToken][auctionIndex]) * num / den);

        if (int(amountAfterFee) > overbuy) {
            // We must process the buy order
            if (overbuy > 0) {
                // We have to adjust the amountAfterFee
                amountAfterFee -= uint(overbuy);
            }

            // Update variables
            balances[buyToken][msg.sender] -= amount;
            buyerBalances[sellToken][buyToken][auctionIndex][msg.sender] += amountAfterFee;
            buyVolumes[sellToken][buyToken][auctionIndex] += amountAfterFee;
            NewBuyOrder(sellToken, buyToken, msg.sender, auctionIndex, amount);
        }

        if (overbuy >= 0) {
            // Clear auction
            clearAuction(sellToken, buyToken, auctionIndex, buyVolumes[sellToken][buyToken][auctionIndex], (sellVolumes[sellToken][buyToken][auctionIndex]));
        } else if (now >= auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] + 6 hours && auctionStarts[orderedPairFristElement(buyToken,sellToken)][orderedPairSecondElement(buyToken,sellToken)]>1) {
            // Prices have crossed
            // We need to clear current or opposite auction
            closeCurrentOrOppositeAuction(
                sellToken,
                buyToken,
                auctionIndex,
                uint(-1 * overbuy),
                num,
                den
            );
        }
    }

    function closeCurrentOrOppositeAuction(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint outstandingVolume,
        uint currentAuctionNum,
        uint currentAuctionDen
    )
        internal
    {
        // Get variables
        //uint sellVolumeOpp = sellVolumes[buyToken][sellToken][auctionIndex];
        //uint buyVolumeOpp = buyVolumes[buyToken][sellToken][auctionIndex];
        uint outstandingVolumeOpp = sellVolumes[buyToken][sellToken][auctionIndex] - buyVolumes[buyToken][sellToken][auctionIndex] * currentAuctionNum / currentAuctionDen;

        if (outstandingVolume <= outstandingVolumeOpp) {
            //uint outstandingVolumeInSellTokens = outstandingVolume * currentAuctionDen / currentAuctionNum;
            
            // Increment buy volume of current & opposite auctions
            buyVolumes[sellToken][buyToken][auctionIndex] += outstandingVolume;
            buyVolumes[buyToken][sellToken][auctionIndex] += outstandingVolume * currentAuctionDen / currentAuctionNum;

            // Record number of tokens added
            arbTokensAdded[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] =  outstandingVolume * currentAuctionDen / currentAuctionNum;

            // Close current auction
            clearAuction(sellToken, buyToken, auctionIndex, buyVolumes[sellToken][buyToken][auctionIndex], sellVolumes[sellToken][buyToken][auctionIndex]);
        } else {
            //uint outstandingVolumeOppInSellTokens = outstandingVolumeOpp * currentAuctionDen / currentAuctionNum;

            // Increment buy volume of current & opposite auctions 
            buyVolumes[sellToken][buyToken][auctionIndex] += outstandingVolumeOpp;
            buyVolumes[buyToken][sellToken][auctionIndex] += outstandingVolumeOpp * currentAuctionDen / currentAuctionNum;

            // Record number of tokens added
            arbTokensAdded[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] = outstandingVolumeOpp;

            // Close opposite auction
            clearAuction(buyToken, sellToken, auctionIndex, buyVolumes[buyToken][sellToken][auctionIndex], sellVolumes[buyToken][sellToken][auctionIndex]);
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
        // Requirements
        uint sellerBalance = sellerBalances[sellToken][buyToken][auctionIndex][user];
        require(sellerBalance > 0);

        // Get closing price for said auction
        fraction memory closingPrice = closingPrices[sellToken][buyToken][auctionIndex];
        uint num = closingPrice.num;
        uint den = closingPrice.den;

        // Require auction to have cleared
        require(den > 0);

        // Calculate return
        returned = sellerBalance * num / den;

        // Get tulips issued based on ETH price of returned tokens
        if (sellToken == ETH) {
            tulipsIssued = sellerBalance;
        } else if (buyToken == ETH) {
            tulipsIssued = returned;
        } else {
            // Neither token is ETH, so we use priceOracle()
            // priceOracle() depends on latestAuctionIndex
            // i.e. if a user claims tokens later in the future,
            // he/she is likely to get slightly different number
            tulipsIssued = PriceOracleInterface(ETHUSDOracle).getTokensValueInCENTS(buyToken,returned);
        }

        // Issue TUL
        TokenTUL(TUL).mintTokens(tulipsIssued);

        // Add extra buy tokens
        uint extraTokensTotal = extraBuyTokens[sellToken][buyToken][auctionIndex];
        uint extraTokens = sellerBalance * extraTokensTotal / sellVolumes[sellToken][buyToken][auctionIndex];
        returned += extraTokens;

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
        returns (uint returned)
    {
        // Must be a valid token pair
        address token1;
        address token2;
        bool validTokenPair;
        (validTokenPair, token1, token2) = checkTokenPairAndOrder(sellToken, buyToken);
        require(validTokenPair);

        returned = getUnclaimedBuyerFunds(sellToken, buyToken, user, auctionIndex);
        require(returned > 0);

        uint latestAuctionIndex = latestAuctionIndices[token1][token2];
        if (auctionIndex == latestAuctionIndex) {
            // Auction is running
            claimedAmounts[sellToken][buyToken][auctionIndex][user] += returned;
        } else {
            // Auction has closed
            // Reset buyerBalances and claimedAmounts
            buyerBalances[sellToken][buyToken][auctionIndex][user] = 0;
            claimedAmounts[sellToken][buyToken][auctionIndex][user] = 0;

            // Assign extra sell tokens (this is possible only after auction has cleared,
            // because buyVolume could still increase before that)
            uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];
            uint extraTokensTotal = extraSellTokens[sellToken][buyToken][auctionIndex];
            uint extraTokens = buyerBalance * extraTokensTotal / buyVolumes[sellToken][buyToken][auctionIndex];
            returned += extraTokens;
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
        returns (uint unclaimedBuyerFunds)
    {
        // Must be a valid token pair
        address token1;
        address token2;
        bool validTokenPair;
        (validTokenPair, token1, token2) = checkTokenPairAndOrder(sellToken, buyToken);
        require(validTokenPair);

        // Checks if particular auction has ever run
        require(auctionIndex <= latestAuctionIndices[token1][token2]);

        uint buyerBalance = buyerBalances[sellToken][buyToken][auctionIndex][user];

        uint num;
        uint den;
        (num, den) = getPrice(sellToken, buyToken, auctionIndex);

        if (num == 0) {
            // This should rarely happen - as long as there is >= 1 buy order,
            // auction will clear before price = 0. So this is just fail-safe
            unclaimedBuyerFunds = 0;
        } else {
            unclaimedBuyerFunds = buyerBalance * den / num - claimedAmounts[sellToken][buyToken][auctionIndex][user];
        }
    }

    function getPrice(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        constant
        returns (uint num, uint den)
    {
         // Must be a valid token pair
        address token1;
        address token2;
        bool validTokenPair;
        (validTokenPair, token1, token2) = checkTokenPairAndOrder(sellToken, buyToken);
        require(validTokenPair);

        // Check if auction has been initialised
        uint latestAuctionIndex = latestAuctionIndices[token1][token2];

        if (auctionIndex < latestAuctionIndex) {
            // Auction has closed
            fraction memory closingPrice = closingPrices[sellToken][buyToken][auctionIndex];
            (num, den) = (closingPrice.num, closingPrice.den);
        } else if (auctionIndex > latestAuctionIndex) {
            (num, den) = (0, 0);
        } else {
            // Auction is running
            uint sellTokenNum;
            uint sellTokenDen;
            if (sellToken != ETH)
                (sellTokenNum, sellTokenDen) = priceOracle(sellToken);
            else 
                (sellTokenNum, sellTokenDen) = (1, 1);

            uint buyTokenNum;
            uint buyTokenDen;

            if (buyToken != ETH) {
                (buyTokenNum, buyTokenDen) = priceOracle(buyToken);
            } else { 
                (buyTokenNum, buyTokenDen) = (1, 1);
            }
            // If we're calling the function into an unstarted auction,
            // it will return the starting price of that auction
            //uint timeElapsed = now - auctionStarts[token1][token2];

            // The numbers below are chosen such that
            // P(0 hrs) = 2 * lastClosingPrice, P(6 hrs) = lastClosingPrice, P(>=24 hrs) = 0
            num = Math.max(0, (86400 - (now - auctionStarts[token1][token2])) * sellTokenNum * buyTokenDen);
            den = ((now - auctionStarts[token1][token2]) + 43200) * sellTokenDen * buyTokenNum;
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
        uint clearingPriceNum,
        uint clearingPriceDen
    )
        internal
    {
         // Get correct token order
        //address token1;
        //address token2;
        //(, token1, token2) = checkTokenPairAndOrder(sellToken, buyToken);

        // Update closing prices
        closingPrices[sellToken][buyToken][auctionIndex] = fraction(clearingPriceNum, clearingPriceDen);

        //uint oppositeClosingPriceDen = closingPrices[buyToken][sellToken][auctionIndex].den;

        // Closing price denominator is initialised as 0
        //if (closingPrices[buyToken][sellToken][auctionIndex].den > 0) {
        if (closingPrices[buyToken][sellToken][auctionIndex].den > 0 || sellVolumes[buyToken][sellToken][auctionIndex] == 0) {
            // Denominator cannot be 0 once auction has cleared, so this means opposite auction has cleared

            // Get amount of tokens that were added through arbitration
            //uint arbitrationTokensAdded = arbTokensAdded[token1][token2];

            if (arbTokensAdded[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] > 0) {
                // Add extra tokens from arbitration to extra tokens
                fraction memory closingPriceOpp = closingPrices[buyToken][sellToken][auctionIndex];
               // uint extraFromArb1 = sellVolumes[sellToken][buyToken][auctionIndex] + buyVolumes[buyToken][sellToken][auctionIndex];
               // uint extraFromArb2 = sellVolumes[buyToken][sellToken][auctionIndex] * closingPriceOpp.num / closingPriceOpp.den;

                // Since this is the larger auction
                // It contains at least one buy order
                // Hence clearing price != 0
                // So dividing by clearingPriceNum doesn't break
               // uint extraFromArb3 = (buyVolumes[sellToken][buyToken][auctionIndex] - arbTokensAdded[token1][token2]) * clearingPriceDen / clearingPriceNum;
               // extraSellTokens[sellToken][buyToken][auctionIndex] += extraFromArb1 - extraFromArb2 - extraFromArb3;
                //there should be a shorter way to calculate the fees:
                extraSellTokens[sellToken][buyToken][auctionIndex] += arbTokensAdded[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)]*closingPriceOpp.num / closingPriceOpp.den - arbTokensAdded[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] * clearingPriceDen / clearingPriceNum;  

            }

            // Check if either auction received sell orders
            //uint sellVolumeNext = sellVolumes[sellToken][buyToken][auctionIndex + 1];
            //uint sellVolumeNextOpposite = sellVolumes[buyToken][sellToken][auctionIndex + 1];
            // uint num;
            // uint den;
            //  (num, den) = priceOracle(buyToken);
            // // uint numBuyToken;
            // uint denBuyToken;
            // (numBuyToken, denBuyToken) = priceOracle(buyToken);
           // if (PriceOracleInterface(ETHUSDOracle).getUSDETHPrice() * sellVolumes[sellToken][buyToken][auctionIndex + 1] * num / den> treshholdForNewAuctionstart || PriceOracleInterface(ETHUSDOracle).getUSDETHPrice()*sellVolumes[buyToken][sellToken][auctionIndex + 1] * den/ num > treshholdForNewAuctionstart) {
            if (PriceOracleInterface(ETHUSDOracle).getTokensValueInCENTS(sellToken, sellVolumes[sellToken][buyToken][auctionIndex + 1]) > treshholdForNewAuctionstart || PriceOracleInterface(ETHUSDOracle).getTokensValueInCENTS(buyToken, sellVolumes[buyToken][sellToken][auctionIndex + 1]) > treshholdForNewAuctionstart) {

                // Schedule next auction
                auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] = now + 10 minutes;
            }else {
                 auctionStarts[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)] = 1;

            }

            latestAuctionIndices[orderedPairFristElement(buyToken, sellToken)][orderedPairSecondElement(buyToken, sellToken)]++;
        }

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
        uint balanceOfTUL = TokenTUL(TUL).getLockedAmount(user);

        // The fee function is chosen such that
        // F(0) = 0.5%, F(1%) = 0.25%, F(>=10%) = 0
        // (Takes in a amount of user's TUL tokens as ration of all TUL tokens, outputs fee ratio)
        // We premultiply by amount to get fee:
        fee = Math.max(0, amount * (TokenTUL(TUL).totalTokens() - 10 * balanceOfTUL) / (16000 * balanceOfTUL + 200 * TokenTUL(TUL).totalTokens()));

        if (fee > 0) {
            // Allow user to reduce up to half of the fee with WIZ

            uint tokenPriceNum;
            uint tokenPriceDen;
            
            if (token != ETH)
                (tokenPriceNum, tokenPriceDen) = priceOracle(token);
            else 
                (tokenPriceNum, tokenPriceDen) = (1, 1);

            // Convert fee to ETH, then USD
            uint feeInETH = fee * tokenPriceNum / tokenPriceDen;
            uint feeInUSD = feeInETH * PriceOracleInterface(ETHUSDOracle).getUSDETHPrice();
            uint amountOfWIZBurned = Math.min(Token(OWL).allowance(msg.sender, this), feeInUSD / 2);

            //burning OWL tokens with delegatecall is risky, because this allows OWL token to modify the storage of this contract.
            // OWL.delegatecall(bytes4(sha3("burnOWL(uint256)")), amount);

            // Adjust fee
            fee = feeInETH * amountOfWIZBurned / feeInUSD;
        }
    }


    /// @dev Gives best estimate for market price of a token in ETH of any price oracle on the Ethereum network
    /// @param buyToken - address of ERC-20 token

    
    function getClosingPriceNum(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public 
        view
        returns (uint) 
    {
        return closingPrices[sellToken][buyToken][auctionIndex].num;
    }


    function getClosingPriceDen(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public 
        view
        returns (uint) 
    {
        return closingPrices[sellToken][buyToken][auctionIndex].num;
    } 

    function getLatestAuctionIndex(
        address sellToken,        
        address buyToken
    )
        public 
        view
        returns (uint) 
    {
        return latestAuctionIndices[sellToken][buyToken];
    }
    
    /// @dev Gives best estimate for market price of a token in ETH of any price oracle on the Ethereum network
    /// @param token address of ERC-20 token
    /// @return Weighted average of closing prices of opposite Token-ETH auctions, based on their sellVolume  
    function priceOracle(
        address token
    )
        public
        constant
        existingToken(token)
        returns (uint num, uint den)
    {
        // Get variables
        uint latestAuctionIndex = latestAuctionIndices[ETH][token];
        fraction memory closingPriceETH = closingPrices[ETH][token][latestAuctionIndex - 1];
        fraction memory closingPriceToken = closingPrices[token][ETH][latestAuctionIndex - 1];


        // We will compute weighted average by considering ETH amount in both auctions

        uint sellVolumeETH = sellVolumes[ETH][token][latestAuctionIndex - 1];
        uint buyVolumeToken = buyVolumes[token][ETH][latestAuctionIndex - 1];
        if (closingPriceETH.num != 0 && closingPriceToken.den != 0) {
            // Compute weighted average
            uint numFirstPart = sellVolumeETH * closingPriceETH.den * closingPriceToken.den;
            uint numSecondPart = buyVolumeToken * closingPriceToken.num * closingPriceETH.num;
            num = numFirstPart + numSecondPart;
            den = closingPriceETH.num * closingPriceToken.den * (sellVolumeETH + buyVolumeToken);
        }
        if (closingPriceToken.den == 0) {
            num = closingPriceETH.num;
            den = closingPriceETH.den;
        }

        if (closingPriceETH.num == 0) {
            num = closingPriceToken.den;
            den = closingPriceToken.num;
        }
    }

    function checkTokenPairAndOrder(
        address token1,
        address token2
    )
        public
        constant
        returns (bool validPair, address _token1, address _token2)
    {
        if (latestAuctionIndices[token1][token2] > 0) {
            return (true, token1, token2);
        } else if (latestAuctionIndices[token2][token1] > 0) {
            return (true, token2, token1);
        } else {
            return (false, 0x0, 0x0);
        }
    }

    function orderedPairFristElement(
        address token1,
        address token2
    )
        public
        constant
        returns (address _token1)
    {
        if (latestAuctionIndices[token1][token2] > 0) {
            return token1;
        } else if (latestAuctionIndices[token2][token1] > 0) {
            return token2;
        } else {
            throw;
        }
    }

    function orderedPairSecondElement(
        address token1,
        address token2
    )
        public
        constant
        returns (address _token1)
    {
        if (latestAuctionIndices[token1][token2] > 0) {
            return token2;
        } else if (latestAuctionIndices[token2][token1] > 0) {
            return token1;
        } else {
            throw;
        }
    }
}
