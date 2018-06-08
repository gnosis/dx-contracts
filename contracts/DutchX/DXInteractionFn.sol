pragma solidity ^0.4.19;

import "./DXAuctionsFn.sol";

contract DXInteractionFn is DXAuctionsFn {
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