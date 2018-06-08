pragma solidity ^0.4.19;

import "./DXInteractionFn.sol";
import "./DXMath.sol";

contract DXAddTokenPair is DXInteractionFn {
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
}