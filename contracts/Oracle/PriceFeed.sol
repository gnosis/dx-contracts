pragma solidity ^0.5.2;
/// price-feed.sol

// Copyright (C) 2017  DappHub, LLC

// Licensed under the Apache License, Version 2.0 (the "License").
// You may not use this file except in compliance with the License.

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND (express or implied).

import "../Oracle/DSThing.sol";

contract PriceFeed is DSThing {
    uint128 val;
    uint32 public zzz;

    function peek() public view returns (bytes32, bool) {
        return (bytes32(uint256(val)), block.timestamp < zzz);
    }

    function read() public view returns (bytes32) {
        assert(block.timestamp < zzz);
        return bytes32(uint256(val));
    }

    function post(uint128 val_, uint32 zzz_, address med_) public payable note auth {
        val = val_;
        zzz = zzz_;
        (bool success, ) = med_.call(abi.encodeWithSignature("poke()"));
        require(success, "The poke must succeed");
    }

    function void() public payable note auth {
        zzz = 0;
    }

}
