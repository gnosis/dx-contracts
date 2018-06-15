pragma solidity ^0.4.21;

/*
  External dependencies contracts
  As on truffle version 4.1.5, is not posible to run migrations from dependencies,
  that use contracts which aren`t explicitly imported in the base project
*/
import "@gnosis.pm/util-contracts/contracts/StandardToken.sol";
import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";
import "@gnosis.pm/gno-token/contracts/TokenGNO.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWLProxy.sol";
import "@gnosis.pm/owl-token/contracts/OWLAirdrop.sol";

/* FIXME only needed for testing and deploy purposes */
import "test/contracts/TokenRDN.sol";
import "test/contracts/TokenOMG.sol";


contract Getter {
}
