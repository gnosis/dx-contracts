pragma solidity ^0.4.19;

contract DXTypes {
	
    // The price is a rational number, so we need a concept of a fraction
    struct fraction {
        uint num;
        uint den;
    }
}