pragma solidity ^0.4.11;

import "./DxMath.sol";
import "./AuctioneerManaged.sol";
import "@gnosis.pm/util-contracts/contracts/Proxy.sol";

contract DxUpgrade is Proxied, AuctioneerManaged, DxMath {
    uint constant WAITING_PERIOD_CHANGE_MASTERCOPY = 30 days;

    address public newMasterCopy;
    // Time when new masterCopy is updatabale
    uint public masterCopyCountdown;

    event NewMasterCopyProposal(
         address newMasterCopy
    );

    function startMasterCopyCountdown (
        address _masterCopy
    )
        public
        onlyAuctioneer
    {
        require(_masterCopy != address(0));

        // Update masterCopyCountdown
        newMasterCopy = _masterCopy;
        masterCopyCountdown = add(now, WAITING_PERIOD_CHANGE_MASTERCOPY);
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
    
}
