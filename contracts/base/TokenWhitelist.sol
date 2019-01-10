pragma solidity ^0.4.11;

import "./AuctioneerManaged.sol";

contract TokenWhitelist is AuctioneerManaged {
    // Mapping that stores the tokens, which are approved
    // Only tokens approved by auctioneer generate frtToken tokens
    // addressToken => boolApproved
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

    /// @dev for quick overview of approved Tokens
    /// @param addressesToCheck are the ERC-20 token addresses to be checked whether they are approved
    function getApprovedAddressesOfList(
        address[] addressesToCheck
    )
        external
        view
        returns (bool[])
    {
        uint length = addressesToCheck.length;

        bool[] memory isApproved = new bool[](length);

        for (uint i = 0; i < length; i++) {
            isApproved[i] = approvedTokens[addressesToCheck[i]];
        }

        return isApproved;
    }
}
