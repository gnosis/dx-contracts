pragma solidity ^0.4.19;

import "./DXAuctionsStorage.sol";
import "./DXMath.sol";

contract DXAuctionsFn is DXMath, DXAuctionsStorage {

    uint constant WAITING_PERIOD_NEW_TOKEN_PAIR = 6 hours;
    uint constant WAITING_PERIOD_NEW_AUCTION = 10 minutes;
    uint constant AUCTION_START_WAITING_FOR_FUNDING = 1;

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