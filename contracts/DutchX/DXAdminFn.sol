pragma solidity ^0.4.19;

import "../Tokens/TokenFRT.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "../Oracle/PriceOracleInterface.sol";  
import "./DXCommonStorage.sol";
import "./DXMath.sol";

contract DXAdminFn is DXCommonStorage, DXMath {
	
    uint constant WAITING_PERIOD_CHANGE_MASTERCOPY_OR_ORACLE = 30 days;

    // > Modifiers
    modifier onlyAuctioneer() {
        // Only allows auctioneer to proceed
        // R1
        require(msg.sender == auctioneer);
        _;
    }

    event LogAddress(string s, address a);
    event Log(string s);

	/// @dev Constructor-Function creates exchange
    /// @param _frtToken - address of frtToken ERC-20 token
    /// @param _owlToken - address of owlToken ERC-20 token
    /// @param _auctioneer - auctioneer for managing interfaces
    /// @param _ethToken - address of ETH ERC-20 token
    /// @param _ethUSDOracle - address of the oracle contract for fetching feeds
    /// @param _thresholdNewTokenPair - Minimum required sell funding for adding a new token pair, in USD
    function setupDutchExchange(
        TokenFRT _frtToken,
        TokenOWL _owlToken,
        address _auctioneer, 
        address _ethToken,
        PriceOracleInterface _ethUSDOracle,
        uint _thresholdNewTokenPair,
        uint _thresholdNewAuction
    )
        public
    {
        // Make sure contract hasn't been initialised
        require(ethToken == 0);

        // Validates inputs
        require(address(_owlToken) != address(0));
        require(address(_frtToken) != address(0));
        require(_auctioneer != 0);
        require(_ethToken != 0);
        require(address(_ethUSDOracle) != address(0));

        frtToken = _frtToken;
        owlToken = _owlToken;
        auctioneer = _auctioneer;
        ethToken = _ethToken;
        ethUSDOracle = _ethUSDOracle;
        thresholdNewTokenPair = _thresholdNewTokenPair;
        thresholdNewAuction = _thresholdNewAuction;
    }

    function updateAuctioneer(
        address _auctioneer
    )
        public
        onlyAuctioneer
    {
        require(_auctioneer != address(0));
        auctioneer = _auctioneer;
    }

    function initiateEthUsdOracleUpdate(
        PriceOracleInterface _ethUSDOracle
    )
        public
        onlyAuctioneer
    {         
        require(address(_ethUSDOracle) != address(0));
        newProposalEthUSDOracle = _ethUSDOracle;
        oracleInterfaceCountdown = add(now, WAITING_PERIOD_CHANGE_MASTERCOPY_OR_ORACLE);
        NewOracleProposal(_ethUSDOracle);
    }

    function updateEthUSDOracle()
        public
        onlyAuctioneer
    {
        require(address(newProposalEthUSDOracle) != address(0));
        require(oracleInterfaceCountdown < now);
        ethUSDOracle = newProposalEthUSDOracle;
        newProposalEthUSDOracle = PriceOracleInterface(0);
    }

    function updateThresholdNewTokenPair(
        uint _thresholdNewTokenPair
    )
        public
        onlyAuctioneer
    {
        thresholdNewTokenPair = _thresholdNewTokenPair;
    }

    function updateThresholdNewAuction(
        uint _thresholdNewAuction
    )
        public
        onlyAuctioneer
    {
        thresholdNewAuction = _thresholdNewAuction;
    }

    function updateApprovalOfToken(
        address[] token,
        bool approved
    )
        public
        onlyAuctioneer
     {  
        for(uint i = 0; i < token.length; i++) {
            approvedTokens[token[i]] = approved;
            Approval(token[i], approved);
        }
     }

     function startMasterCopyCountdown (
        address _masterCopy
     )
        public
        onlyAuctioneer
    {
        require(_masterCopy != address(0));

        // Update masterCopyCountdown
        newMasterCopy = _masterCopy;
        masterCopyCountdown = add(now, WAITING_PERIOD_CHANGE_MASTERCOPY_OR_ORACLE);
        NewMasterCopyProposal(_masterCopy);
    }

    function updateMasterCopy()
        public
        onlyAuctioneer
    {
        require(newMasterCopy != address(0));
        require(now >= masterCopyCountdown);

        // Update masterCopy
        masterCopy = newMasterCopy;
        newMasterCopy = address(0);
    }

    function getMasterCopy()
        external
        view 
        returns (address)
    {
        return masterCopy;
    }

    event Approval(
        address indexed token,
        bool approved
    );

    event NewOracleProposal(
         PriceOracleInterface priceOracleInterface
    );


    event NewMasterCopyProposal(
         address newMasterCopy
    );
}