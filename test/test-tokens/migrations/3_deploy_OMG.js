/* global deployer */
/* eslint no-undef: "error" */

const TokenOMG = artifacts.require("TokenOMG");
const INITIAL_FUNDING = 10e6 // 00M

module.exports = function(deployer) {
  deployer.deploy(TokenOMG, INITIAL_FUNDING * 1e18);
};
