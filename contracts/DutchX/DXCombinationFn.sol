pragma solidity ^0.4.19;

import "./DXAddTokenPair.sol";

contract DXCombinationFn is DXAddTokenPair {

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
}