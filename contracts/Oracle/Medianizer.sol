pragma solidity ^0.5.0;

import "./DSValue.sol";

contract Medianizer is DSValue {
    mapping(bytes12 => address) public values;
    mapping(address => bytes12) public indexes;
    bytes12 public next = bytes12(uint96(1));
    uint96 public minimun = 0x1;

    function set(address wat) public auth {
        bytes12 nextId = bytes12(uint96(next) + 1);
        assert(nextId != 0x0);
        set(next, wat);
        next = nextId;
    }

    function set(bytes12 pos, address wat) public payable note auth {
        require(pos != 0x0, "pos cannot be 0x0");
        require(wat == address(0) || indexes[wat] == 0, "wat is not defined or it has an index");

        indexes[values[pos]] = bytes12(0); // Making sure to remove a possible existing address in that position

        if (wat != address(0)) {
            indexes[wat] = pos;
        }

        values[pos] = wat;
    }

    function setMin(uint96 min_) public payable note auth {
        require(min_ != 0x0, "min cannot be 0x0");
        minimun = min_;
    }

    function setNext(bytes12 next_) public payable note auth {
        require(next_ != 0x0, "next cannot be 0x0");
        next = next_;
    }

    function unset(bytes12 pos) public {
        set(pos, address(0));
    }

    function unset(address wat) public {
        set(indexes[wat], address(0));
    }

    function poke() public {
        poke(0);
    }

    function poke(bytes32) public payable note {
        (val, has) = compute();
    }

    function compute() public view returns (bytes32, bool) {
        bytes32[] memory wuts = new bytes32[](uint96(next) - 1);
        uint96 ctr = 0;
        for (uint96 i = 1; i < uint96(next); i++) {
            if (values[bytes12(i)] != address(0)) {
                (bytes32 wut, bool wuz) = DSValue(values[bytes12(i)]).peek();
                if (wuz) {
                    if (ctr == 0 || wut >= wuts[ctr - 1]) {
                        wuts[ctr] = wut;
                    } else {
                        uint96 j = 0;
                        while (wut >= wuts[j]) {
                            j++;
                        }
                        for (uint96 k = ctr; k > j; k--) {
                            wuts[k] = wuts[k - 1];
                        }
                        wuts[j] = wut;
                    }
                    ctr++;
                }
            }
        }

        if (ctr < minimun) return (val, false);

        bytes32 value;
        if (ctr % 2 == 0) {
            uint128 val1 = uint128(uint(wuts[(ctr / 2) - 1]));
            uint128 val2 = uint128(uint(wuts[ctr / 2]));
            value = bytes32(uint256(wdiv(hadd(val1, val2), 2 ether)));
        } else {
            value = wuts[(ctr - 1) / 2];
        }

        return (value, true);
    }
}
