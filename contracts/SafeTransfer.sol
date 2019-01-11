
pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/Token.sol";

contract SafeTransfer {
    function safeTransfer(address token, address to, uint value, bool from) public returns (bool result) {
        if (from) {
            Token(token).transferFrom(msg.sender, this, value);
        } else {
            Token(token).transfer(to, value);
        }

        assembly {
          switch returndatasize()   
            case 0 {                      // This is our BadToken
              result := not(0)          // result is true
            }
            case 32 {                     // This is our GoodToken
              returndatacopy(0, 0, 32) 
              result := mload(0)        // result == returndata of external call
            }
            default {                     // This is not an ERC20 token
              revert(0, 0) 
            }
        }
        return result;
    }
}