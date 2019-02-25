pragma solidity ^0.5.2;

import "./DutchExchange.sol";


contract DutchExchangeHelper {
    DutchExchange public dx;

    constructor (address _dx) public {
        require(address(_dx) != address(0));
        dx = DutchExchange(_dx);
    }

    function getRunningTokenPairs(address[] calldata tokens)
        external
        view
        returns (address[] memory tokens1, address[] memory tokens2)
    {
        uint arrayLength;

        for (uint k = 0; k < tokens.length - 1; k++) {
            for (uint j = k + 1; j < tokens.length; j++) {
                if (dx.getAuctionIndex(tokens[k], tokens[j]) > 0) {
                    arrayLength++;
                }
            }
        }

        tokens1 = new address[](arrayLength);
        tokens2 = new address[](arrayLength);

        uint h;

        for (uint i = 0; i < tokens.length - 1; i++) {
            for (uint j = i + 1; j < tokens.length; j++) {
                if (dx.getAuctionIndex(tokens[i], tokens[j]) > 0) {
                    tokens1[h] = tokens[i];
                    tokens2[h] = tokens[j];
                    h++;
                }
            }
        }
    }


    /// @dev for quick overview of possible sellerBalances to calculate the possible withdraw tokens
    /// @param auctionSellToken is the sellToken defining an auctionPair
    /// @param auctionBuyToken is the buyToken defining an auctionPair
    /// @param user is the user who wants to his tokens
    /// @param lastNAuctions how many auctions will be checked. 0 means all
    //@returns returns sellbal for all indices for all tokenpairs
    function getIndicesWithClaimableTokensForSellers(
        address auctionSellToken,
        address auctionBuyToken,
        address user,
        uint lastNAuctions
    ) external view returns (uint[] memory indices, uint[] memory usersBalances)
    {
        uint runningAuctionIndex = dx.getAuctionIndex(auctionSellToken, auctionBuyToken);

        uint arrayLength;

        uint startingIndex = lastNAuctions == 0 ? 1 : runningAuctionIndex - lastNAuctions + 1;

        for (uint j = startingIndex; j <= runningAuctionIndex; j++) {
            if (dx.sellerBalances(auctionSellToken, auctionBuyToken, j, user) > 0) {
                arrayLength++;
            }
        }

        indices = new uint[](arrayLength);
        usersBalances = new uint[](arrayLength);

        uint k;

        for (uint i = startingIndex; i <= runningAuctionIndex; i++) {
            if (dx.sellerBalances(auctionSellToken, auctionBuyToken, i, user) > 0) {
                indices[k] = i;
                usersBalances[k] = dx.sellerBalances(auctionSellToken, auctionBuyToken, i, user);
                k++;
            }
        }
    }


    /// @dev for quick overview of current sellerBalances for a user
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param user is the user who wants to his tokens
    function getSellerBalancesOfCurrentAuctions(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        address user
    ) external view returns (uint[] memory)
    {
        uint length = auctionSellTokens.length;
        uint length2 = auctionBuyTokens.length;
        require(length == length2);

        uint[] memory sellersBalances = new uint[](length);

        for (uint i = 0; i < length; i++) {
            uint runningAuctionIndex = dx.getAuctionIndex(auctionSellTokens[i], auctionBuyTokens[i]);
            sellersBalances[i] = dx.sellerBalances(auctionSellTokens[i], auctionBuyTokens[i], runningAuctionIndex, user);
        }

        return sellersBalances;
    }


    /// @dev for quick overview of possible buyerBalances to calculate the possible withdraw tokens
    /// @param auctionSellToken is the sellToken defining an auctionPair
    /// @param auctionBuyToken is the buyToken defining an auctionPair
    /// @param user is the user who wants to his tokens
    /// @param lastNAuctions how many auctions will be checked. 0 means all
    //@returns returns sellbal for all indices for all tokenpairs
    function getIndicesWithClaimableTokensForBuyers(
        address auctionSellToken,
        address auctionBuyToken,
        address user,
        uint lastNAuctions
    ) external view returns (uint[] memory indices, uint[] memory usersBalances)
    {
        uint runningAuctionIndex = dx.getAuctionIndex(auctionSellToken, auctionBuyToken);

        uint arrayLength;

        uint startingIndex = lastNAuctions == 0 ? 1 : runningAuctionIndex - lastNAuctions + 1;

        for (uint j = startingIndex; j <= runningAuctionIndex; j++) {
            if (dx.buyerBalances(auctionSellToken, auctionBuyToken, j, user) > 0) {
                arrayLength++;
            }
        }

        indices = new uint[](arrayLength);
        usersBalances = new uint[](arrayLength);

        uint k;

        for (uint i = startingIndex; i <= runningAuctionIndex; i++) {
            if (dx.buyerBalances(auctionSellToken, auctionBuyToken, i, user) > 0) {
                indices[k] = i;
                usersBalances[k] = dx.buyerBalances(auctionSellToken, auctionBuyToken, i, user);
                k++;
            }
        }
    }

    /// @dev for quick overview of current sellerBalances for a user
    /// @param auctionSellTokens are the sellTokens defining an auctionPair
    /// @param auctionBuyTokens are the buyTokens defining an auctionPair
    /// @param user is the user who wants to his tokens
    function getBuyerBalancesOfCurrentAuctions(
        address[] calldata auctionSellTokens,
        address[] calldata auctionBuyTokens,
        address user
    ) external view returns (uint[] memory)
    {
        uint length = auctionSellTokens.length;
        uint length2 = auctionBuyTokens.length;
        require(length == length2);

        uint[] memory buyersBalances = new uint[](length);

        for (uint i = 0; i < length; i++) {
            uint runningAuctionIndex = dx.getAuctionIndex(auctionSellTokens[i], auctionBuyTokens[i]);
            buyersBalances[i] = dx.buyerBalances(auctionSellTokens[i], auctionBuyTokens[i], runningAuctionIndex, user);
        }

        return buyersBalances;
    }
}
