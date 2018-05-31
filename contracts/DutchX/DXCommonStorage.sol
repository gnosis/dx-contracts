pragma solidity ^0.4.19;

import "../Tokens/TokenFRT.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "../Oracle/PriceOracleInterface.sol";

contract DXCommonStorage {
    // Ether ERC-20 token
    address public ethToken;
    // Price Oracle interface 
    PriceOracleInterface public ethUSDOracle;
    // Price Oracle interface proposals during update process
    PriceOracleInterface public newProposalEthUSDOracle;
    uint public oracleInterfaceCountdown;
    // Minimum required sell funding for adding a new token pair, in USD
    uint public thresholdNewTokenPair;
    // Minimum required sell funding for starting antoher auction, in USD
    uint public thresholdNewAuction;
    // Fee reduction token (magnolia, ERC-20 token)
    TokenFRT public frtToken;
    // Token for paying fees
    TokenOWL public owlToken;

    // mapping that stores the tokens, which are approved
    // Token => approved
    // Only tokens approved by auctioneer generate frtToken tokens
    mapping (address => bool) public approvedTokens;
}