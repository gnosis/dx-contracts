pragma solidity ^0.4.19;

import "../Tokens/TokenFRT.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "./DXAdminFn.sol";
import "./DXAddTokenPair.sol";

/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Alex Herrmann - <alex@gnosis.pm>
/// @author Dominik Teiml - <dominik@gnosis.pm>

contract DutchExchange is DXAdminFn, DXAddTokenPair {
	// The contract is structured in two branches:

	// Admin:
	// DXAdminFn has functions, events and constants for admin of the exchange
	// DXAdminFn is DXAdminStorage

	// Auctions:
	// AddTokenPair defines logic for adding a new token pair
	// InteractionFn includes functions for interacting with contract
	// AuctionsFn has logic internal to the exchange
	// HelperFn defines getters and setters for auctionIndex and auctionStart
}
