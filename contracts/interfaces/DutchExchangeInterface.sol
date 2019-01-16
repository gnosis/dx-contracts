pragma solidity ^0.5.2;

interface DutchExchangeInterface {
    /**
     * Getters 
     */
    function ethToken() external view returns (address);
    function frtToken() external view returns (address);
    function closingPrices(address sellToken, address buyToken, uint auctionIndex) external view returns (uint num, uint den);


    /**
     * Core Functions 
     */
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
        external;

    function deposit(
        address tokenAddress,
        uint amount
    ) 
        external 
        returns (uint);

    function withdraw(
        address tokenAddress,
        uint amount
    ) 
        external 
        returns (uint);

    function postSellOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    ) 
        external 
        returns (uint, uint);

    function postBuyOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount
    )
        external
        returns (uint);

    function claimSellerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        external
        // < (10^60, 10^61)
        returns (uint returned, uint frtsIssued);

    function claimBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        external
        returns (uint returned, uint frtsIssued);

    function closeTheoreticalClosedAuction(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        external;

    function getUnclaimedBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        external
        view
        // < (10^67, 10^37)
        returns (uint unclaimedBuyerFunds, uint num, uint den);    

    function getFeeRatio(
        address user
    )
        external
        view
        // feeRatio < 10^4
        returns (uint num, uint den);

    /// @dev returns price in units [token2]/[token1]
    /// @param token1 first token for price calculation
    /// @param token2 second token for price calculation
    /// @param auctionIndex index for the auction to get the averaged price from
    function getPriceInPastAuction(
        address token1,
        address token2,
        uint auctionIndex
    )
        external
        view
        // price < 10^31
        returns (uint num, uint den);

    /// @dev Gives best estimate for market price of a token in ETH of any price oracle on the Ethereum network
    /// @param token address of ERC-20 token
    /// @return Weighted average of closing prices of opposite Token-ethToken auctions, based on their sellVolume
    function getPriceOfTokenInLastAuction(
        address token
    )
        external
        view
        // price < 10^31
        returns (uint num, uint den);

    function getCurrentAuctionPrice(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        external
        view
        // price < 10^37
        returns (uint num, uint den);

    function depositAndSell(
        address sellToken,
        address buyToken,
        uint amount
    )
        external
        returns (uint newBal, uint auctionIndex, uint newSellerBal);

    function getAuctionIndex(
        address token1,
        address token2
    )
        external
        view
        returns (uint auctionIndex);

    function getRunningTokenPairs(
        address[] calldata tokens
    )
        external
        view
        returns (address[] memory tokens1, address[] memory tokens2);

    /// @dev for quick overview of possible sellerBalances to calculate the possible withdraw tokens
    /// @param auctionSellToken is the sellToken defining an auctionPair
    /// @param auctionBuyToken is the buyToken defining an auctionPair
    /// @param user is the user who wants to his tokens
    /// @param lastNAuctions how many auctions will be checked. 0 means all
    // @returns returns sellbal for all indices for all tokenpairs
    function getIndicesWithClaimableTokensForSellers(
        address auctionSellToken,
        address auctionBuyToken,
        address user,
        uint lastNAuctions
    )
        external
        view
        returns(uint[] memory indices, uint[] memory usersBalances);        

    /// @dev for quick overview of current sellerBalances for a user
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param user is the user who wants to his tokens
    function getSellerBalancesOfCurrentAuctions(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        address user
    )
        external
        view
        returns (uint[] memory);
    
    /// @dev for quick overview of possible buyerBalances to calculate the possible withdraw tokens
    /// @param auctionSellToken is the sellToken defining an auctionPair
    /// @param auctionBuyToken is the buyToken defining an auctionPair
    /// @param user is the user who wants to his tokens
    /// @param lastNAuctions how many auctions will be checked. 0 means all
    // @returns returns sellbal for all indices for all tokenpairs
    function getIndicesWithClaimableTokensForBuyers(
        address auctionSellToken,
        address auctionBuyToken,
        address user,
        uint lastNAuctions
    )
        external
        view
        returns(uint[] memory indices, uint[] memory usersBalances);

    /// @dev for quick overview of current sellerBalances for a user
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param user is the user who wants to his tokens
    function getBuyerBalancesOfCurrentAuctions(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        address user
    )
        external
        view
        returns (uint[] memory);

    /// @dev for multiple claims
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param auctionIndices are the auction indices on which an token should be claimedAmounts
    /// @param user is the user who wants to his tokens
    function claimTokensFromSeveralAuctionsAsSeller(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        uint[] calldata auctionIndices,
        address user
    )
        external
        returns (uint[] memory, uint[] memory);

    /// @dev for multiple claims
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param auctionIndices are the auction indices on which an token should be claimedAmounts
    /// @param user is the user who wants to his tokens
    function claimTokensFromSeveralAuctionsAsBuyer(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        uint[] calldata auctionIndices,
        address user
    )
        external
        returns (uint[] memory, uint[] memory);

    /// @dev for multiple withdraws
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param auctionIndices are the auction indices on which an token should be claimedAmounts
    function claimAndWithdrawTokensFromSeveralAuctionsAsSeller(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        uint[] calldata auctionIndices
    )
        external
        returns (uint[] memory, uint frtsIssued);
    
    /// @dev for multiple withdraws
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param auctionIndices are the auction indices on which an token should be claimedAmounts
    function claimAndWithdrawTokensFromSeveralAuctionsAsBuyer(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        uint[] calldata auctionIndices
    )
        external
        returns (uint[] memory, uint frtsIssued);

    function getMasterCopy()
        external
        view
        returns (address);

    /**
     * Events
     */
    event NewDeposit(
        address indexed token,
        uint amount
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