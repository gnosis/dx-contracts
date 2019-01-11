pragma solidity ^0.5.2;

// NOTE:
//  This file porpouse is just to make sure truffle compiles all of depending
//  contracts when we are in development.
//
//  For other environments, we just use the compiled contracts from the NPM
//  package

// TODO: Use the same getter pattern also for dependencies
import "@gnosis.pm/util-contracts/contracts/GnosisStandardToken.sol";
import "@gnosis.pm/util-contracts/contracts/EtherToken.sol";
import "@gnosis.pm/gno-token/contracts/TokenGNO.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWLProxy.sol";
import "@gnosis.pm/owl-token/contracts/OWLAirdrop.sol";

// DX contracts
import "./Oracle/MedianizerMock.sol";
import "./TokenFRT.sol";
import "./TokenFRTProxy.sol";
import "./DutchExchange.sol";
import "./DutchExchangeProxy.sol";


contract DxDevDependencies {}
