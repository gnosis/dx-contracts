pragma solidity ^0.5.2;

import "./Medianizer.sol";

contract MedianizerMock is Medianizer {
    bytes32 public price;
    bool public valid = true;
    address public owner;

    constructor() public {
        owner = msg.sender;
    }

    function updateOwner(address _owner) public onlyOwner {
        require(_owner != address(0), "The auctioneer must be a valid address");
        owner = _owner;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can nominate a new one");
        _;
    }

    function setPrice(bytes32 _price) public onlyOwner {
        price = _price;
    }

    function setValid(bool _valid) public onlyOwner {
        bool valid = _valid;
    }

    function set(bytes32 _price, bool _valid) public onlyOwner {
        price = _price;
        valid = _valid;
    }

    function peek() public view returns (bytes32, bool) {
        return (price, valid);
    }

    // function bytesToUint(bytes b) public pure returns (uint256){
    //     uint256 number;
    //     for(uint i=0;i<b.length;i++){
    //         number = number + uint(b[i])*(2**(8*(b.length-(i+1))));
    //     }
    //     return number;
    // }
}
