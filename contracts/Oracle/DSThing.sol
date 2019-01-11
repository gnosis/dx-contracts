pragma solidity ^0.5.0;

import "../Oracle/DSMath.sol";
import "../Oracle/DSAuth.sol";
import "../Oracle/DSNote.sol";

contract DSThing is DSAuth, DSNote, DSMath {}
