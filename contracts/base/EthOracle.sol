pragma solidity ^0.4.11;

import "../Oracle/PriceOracleInterface.sol";
import "./AuctioneerManaged.sol";
import "./DxMath.sol";

contract EthOracle is AuctioneerManaged, DxMath {
    uint constant WAITING_PERIOD_CHANGE_ORACLE = 30 days;
    
    // Price Oracle interface 
    PriceOracleInterface public ethUSDOracle;
    // Price Oracle interface proposals during update process
    PriceOracleInterface public newProposalEthUSDOracle;
    
    uint public oracleInterfaceCountdown;

    event NewOracleProposal(
         PriceOracleInterface priceOracleInterface
    );

    function initiateEthUsdOracleUpdate(
        PriceOracleInterface _ethUSDOracle
    )
        public
        onlyAuctioneer
    {         
        require(address(_ethUSDOracle) != address(0));
        newProposalEthUSDOracle = _ethUSDOracle;
        oracleInterfaceCountdown = add(now, WAITING_PERIOD_CHANGE_ORACLE);
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
}