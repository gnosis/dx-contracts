pragma solidity 0.4.18;

import "./../Utils/Math.sol";
import "./../Tokens/Token.sol";  

/// @title Dutch Exchange - exchange token pairs with the clever mechanism of the dutch auction
/// @author Dominik Teiml - <dominik@gnosis.pm>
    
    
contract DutchExchangeInterface {

    // The price is a rational number, so we need a concept of a fraction
    struct fraction {
        uint num;
        uint den;
    }

    address public owner;
    // Ether ERC-20 token
    address public ETH;
    address public ETHUSDOracle;
    address public TUL;
    address public OWL;

    // Token => approved
    // Only tokens approved by owner generate TUL tokens
    mapping (address => bool) public approvedTokens;



    // The following three mappings are symmetric - m[t1][t2] = m[t2][t1]
    // The order depends on in which order the tokens were submitted in addTokenPair()
    // ETH-Token pairs will always have ETH first, T-T pairs will have arbitrary order 
    // Token => Token => index
    mapping (address => mapping (address => uint)) public latestAuctionIndices;
    // Token => Token => time
    mapping (address => mapping (address => uint)) public auctionStarts;


    // Token => Token => auctionIndex => price
    mapping (address => mapping (address => mapping (uint => fraction))) public closingPrices;

    // Token => user => amount
    // balances stores a user's balance in the DutchX
    mapping (address => mapping (address => uint)) public balances;

    // Token => Token => auctionIndex => amount
    // We store historical values, because they are necessary to calculate extraTokens
    mapping (address => mapping (address => mapping (uint => uint))) public sellVolumes;
    mapping (address => mapping (address => mapping (uint => uint))) public buyVolumes;

    // Token => Token => auctionIndex => amount
    mapping (address => mapping (address => mapping (uint => uint))) public extraSellTokens;
    mapping (address => mapping (address => mapping (uint => uint))) public extraBuyTokens;

    // Token => Token =>  auctionIndex => user => amount
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public sellerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public buyerBalances;
    mapping (address => mapping (address => mapping (uint => mapping (address => uint)))) public claimedAmounts;

    // Events
    event NewDeposit(address indexed token, uint indexed amount);
    event NewWithdrawal(address indexed token, uint indexed amount);
    
    event NewSellOrder(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount
    );

    event NewBuyOrder(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount
    );

    event NewSellerFundsClaim(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount
    );

    event NewBuyerFundsClaim(
        address indexed sellToken,
        address indexed buyToken,
        address indexed user,
        uint auctionIndex,
        uint amount
    );

    event AuctionCleared(address indexed sellToken, address indexed buyToken, uint indexed auctionIndex);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier existingToken(address token) {
        require(latestAuctionIndices[ETH][token] > 0);
        _;
    }

    modifier existingTokenPair(address sellToken, address buyToken) {
        require(latestAuctionIndices[sellToken][buyToken] > 0);
        _;
    }

   
    function updateOwner(
        address newOwner
    )
        public
        onlyOwner();
    function updateApprovalOfToken(
        address token,
        bool approved
    )
        public
        onlyOwner();

    function updateETHUSDPriceOracle(
        address _ETHUSDOracle
    )
        public
        onlyOwner();

    /// @param initialClosingPriceNum initial price will be 2 * initialClosingPrice. This is its numerator
    /// @param initialClosingPriceDen initial price will be 2 * initialClosingPrice. This is its denominator
    function addTokenPair(
        address token1,
        address token2,
        uint initialClosingPriceNum,
        uint initialClosingPriceDen
    )
        public;

    function deposit(
        address tokenAddress,
        uint amount
    )
        public
        existingToken(tokenAddress);

    function withdraw(
        address tokenAddress,
        uint amount
    )
        public
        existingToken(tokenAddress);

    function postSellOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amountSubmitted,
        uint amountOfWIZToBurn
    )
        public
        existingTokenPair(sellToken, buyToken);

    function postBuyOrder(
        address sellToken,
        address buyToken,
        uint auctionIndex,
        uint amount, // originally amountSubmitted
        uint amountOfWIZToBurn
    )
        public
        existingTokenPair(sellToken, buyToken);

    function checkArbitragePossibilityInOppositeMarket(
        uint auctionIndex,
        address sellToken,
        address buyToken
    )
    internal;

    function fillUpOppositeAuction(
        address sellToken,
        address buyToken,
        uint volume,
        uint numClearing,
        uint denClearing,
        uint auctionIndex
    )
    internal;



    function claimSellerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        returns (uint returned);
    function claimBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        returns (uint returned);
    /// @dev Claim buyer funds for one auction
    function getUnclaimedBuyerFunds(
        address sellToken,
        address buyToken,
        address user,
        uint auctionIndex
    )
        public
        constant
        returns (uint unclaimedBuyerFunds);

    function getPrice(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        public
        constant
        returns (uint num, uint den);

    function clearAuction(
        address sellToken,
        address buyToken,
        uint auctionIndex
    )
        internal;
    
    function waitOrScheduleNextAuction(
        address sellToken,
        address buyToken,
        uint latestAuctionIndex
    )
    internal;

    function calculateFee(
        address sellToken,
        address buyToken,
        address user,
        uint amount,
        uint amountOfWIZBurnedSubmitted
    )
        internal
        returns (uint fee);
    
    function getClosingPriceNum(
        address buyToken,
        address sellToken,
        uint auctionIndex
    )
        public 
        view
        returns (uint); 
   

    function getClosingPriceDen(
        address buyToken,
        address sellToken,
        uint auctionIndex
    )
        public
        view 
        returns (uint);

    function getLatestAuctionIndex(
        address buyToken,
        address sellToken
    )
        public 
        view
        returns (uint);
    
}