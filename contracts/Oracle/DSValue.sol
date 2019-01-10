pragma solidity ^0.5.0;

import "../Oracle/DSThing.sol";

contract DSValue is DSThing {
    bool has;
    bytes32 val;
    function peek() public view returns (bytes32, bool) {
        return (val, has);
    }
    function read() public view returns (bytes32) {
        (bytes32 wut, bool _has) = peek();
        assert(_has);
        return wut;
    }
    function poke(bytes32 wut) public note auth {
        val = wut;
        has = true;
    }
    function void() public note auth {
        // unset the value
        has = false;
    }
}
