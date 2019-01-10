pragma solidity ^0.5.0;

import "./DxMath.sol";
import "./AuctioneerManaged.sol";
import "@gnosis.pm/util-contracts/contracts/Proxy.sol";

contract DxUpgrade is Proxied, AuctioneerManaged, DxMath {
    uint constant WAITING_PERIOD_CHANGE_MASTERCOPY = 30 days;

    address public newMasterCopy;
    // Time when new masterCopy is updatabale
    uint public masterCopyCountdown;

    event NewMasterCopyProposal(address newMasterCopy);

    function startMasterCopyCountdown(address _masterCopy) public onlyAuctioneer {
        require(_masterCopy != address(0), "The new master copy must be a valid address");

        // Update masterCopyCountdown
        newMasterCopy = _masterCopy;
        masterCopyCountdown = add(block.timestamp, WAITING_PERIOD_CHANGE_MASTERCOPY);
        emit NewMasterCopyProposal(_masterCopy);
    }

    function updateMasterCopy() public {
        require(newMasterCopy != address(0), "The new master copy must be a valid address");
        require(block.timestamp >= masterCopyCountdown, "The master contract cannot be updated in a waiting period");

        // Update masterCopy
        masterCopy = newMasterCopy;
        newMasterCopy = address(0);
    }

}
