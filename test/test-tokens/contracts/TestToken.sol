pragma solidity ^0.5.2;

import "@gnosis.pm/util-contracts/contracts/GnosisStandardToken.sol";

contract TestToken is GnosisStandardToken {
    address public minter;
    string public symbol;
    string public name;
    uint8 public decimals;

    modifier onlyMinter() {
        require(msg.sender == minter);
        _;
    }

    constructor(string memory _symbol, string memory _name, uint8 _decimals, uint amount) public {
        minter = msg.sender;
        symbol = _symbol;
        name = _name;
        decimals = _decimals;
        balances[minter] = amount;
        totalTokens = amount;

        emit SetMinter(minter);
        emit Mint(minter, amount);
    }

    function mint(address _address, uint amount) public onlyMinter {
        balances[_address] += amount;
        totalTokens += amount;
        emit Mint(_address, amount);
    }

    function changeMinter(address _minter) public onlyMinter {
        minter = _minter;
        emit SetMinter(minter);
    }

    event Mint(address indexed token, uint amount);

    event SetMinter(address indexed minter);
}
