/* global deployer */
/* eslint no-undef: "error" */

const TokenRDN = artifacts.require("TokenRDN");
const INITIAL_FUNDING = 100e6 // 100M

module.exports = function(deployer) {
  deployer.deploy(TokenRDN, INITIAL_FUNDING * 1e18);
};
