pragma solidity ^0.5.0;

contract AuctioneerManaged {
    // auctioneer has the power to manage some variables
    address public auctioneer;

    function updateAuctioneer(address _auctioneer) public onlyAuctioneer {
        require(_auctioneer != address(0), "The auctioneer must be a valid address");
        auctioneer = _auctioneer;
    }

    // > Modifiers
    modifier onlyAuctioneer() {
        // Only allows auctioneer to proceed
        // R1
        // require(msg.sender == auctioneer, "Only auctioneer can perform this operation");
        require(msg.sender == auctioneer, "Only the auctioneer can nominate a new one");
        _;
    }
}
