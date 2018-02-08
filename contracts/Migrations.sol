pragma solidity ^0.4.19;



import "@gnosis.pm/owl-token/contracts/OWLAirdrop.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWLProxy.sol";
import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/EtherToken.sol";

contract Migrations {
    address public owner;
    uint public last_completed_migration;

    modifier restricted() {
        if (msg.sender == owner) _;
    }

    function Migrations()
        public
    {
        owner = msg.sender;
    }

    function setCompleted(uint completed)
        public
        restricted
    {
        last_completed_migration = completed;
    }

    function upgrade(address new_address)
        public
        restricted
    {
        Migrations upgraded = Migrations(new_address);
        upgraded.setCompleted(last_completed_migration);
    }
}