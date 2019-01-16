pragma solidity ^0.5.2;

import "@gnosis.pm/util-contracts/contracts/Proxy.sol";
import "@gnosis.pm/util-contracts/contracts/GnosisStandardToken.sol";


contract TokenFRTProxy is Proxy, GnosisStandardToken {
    /// @dev State variables remain for Blockchain exploring Proxied Token contracts
    address public owner;

    string public constant symbol = "MGN";
    string public constant name = "Magnolia Token";
    uint8 public constant decimals = 18;

    constructor(address proxied, address _owner) public Proxy(proxied) {
        require(_owner != address(0), "owner address cannot be 0");
        owner = _owner;
    }
}
