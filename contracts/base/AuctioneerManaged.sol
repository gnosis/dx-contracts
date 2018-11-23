pragma solidity ^0.4.11;

contract AuctioneerManaged {
    // auctioneer has the power to manage some variables
    address public auctioneer;

    function updateAuctioneer(
        address _auctioneer
    )
        public
        onlyAuctioneer
    {
        // require(_auctioneer != address(0), "New auctioneer cannot be 0x0");
        require(_auctioneer != address(0));
        auctioneer = _auctioneer;
    }

    // > Modifiers
    modifier onlyAuctioneer() {
        // Only allows auctioneer to proceed
        // R1
        // require(msg.sender == auctioneer, "Only auctioneer can perform this operation");
        require(msg.sender == auctioneer);
        _;
    }
}