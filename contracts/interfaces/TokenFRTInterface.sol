pragma solidity ^0.4.24;

import "./TokenFRTInterfaceCore.sol";
// TODO: potentially replace with util-contracts PR GnosisIERC20Info.sol (interface w/ERC20 token name, symbol etc)
interface GnosisIERC20Info {
    /*
     *  Public getters
     */
    function name() external view returns (string);
    function symbol() external view returns (string);
    function decimals() external view returns (uint8);
}

/// @title TokenFRTInterfaceFull - Abstract Contract
/// @dev   Full (token info + core FRT functions) TokenFRT + ERC20 naming interface
//  @todo  Replace with proper interface when/if inheritance is incorporated
contract TokenFRTInterface is GnosisIERC20Info, TokenFRTInterfaceCore {}
