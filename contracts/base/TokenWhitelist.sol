pragma solidity ^0.4.11;

import "./AuctioneerManaged.sol";

contract TokenWhitelist is AuctioneerManaged {
    // mapping that stores the tokens, which are approved
    // Token => approved
    // Only tokens approved by auctioneer generate frtToken tokens
    mapping (address => bool) public approvedTokens;

    event Approval(
        address indexed token,
        bool approved
    );

    function updateApprovalOfToken(
        address[] token,
        bool approved
    ) public onlyAuctioneer {  
        for(uint i = 0; i < token.length; i++) {
            approvedTokens[token[i]] = approved;
            emit Approval(token[i], approved);
        }
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
}
