pragma solidity ^0.4.19;

import "@gnosis.pm/owl-token/contracts/OWLAirdrop.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWLProxy.sol";
import "@gnosis.pm/gnosis-core-contracts/contracts/Tokens/EtherToken.sol";

/*
Dirty Solution for providing builds from imported code to truffle-suite.
Other solutions would require new releases of the smartcontract with builds included and getting them via npm
*/
contract Getter{

}