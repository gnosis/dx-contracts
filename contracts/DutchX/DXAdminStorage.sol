pragma solidity ^0.4.19;

import "../Tokens/TokenFRT.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "../Oracle/PriceOracleInterface.sol";
import "./DXCommonStorage.sol";

contract DXAdminStorage is DXCommonStorage {
    // variables for Proxy Construction
    
    address masterCopy;
    address public newMasterCopy;
    // Time when new masterCopy is updatabale
    uint public masterCopyCountdown;

    // > Storage
    // auctioneer has the power to manage some variables
    address public auctioneer;
}