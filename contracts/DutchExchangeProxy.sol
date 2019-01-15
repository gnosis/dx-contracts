pragma solidity ^0.5.2;

import "@gnosis.pm/util-contracts/contracts/Proxy.sol";

contract DutchExchangeProxy is Proxy {
    constructor(address _masterCopy) public Proxy(_masterCopy) {}
}
