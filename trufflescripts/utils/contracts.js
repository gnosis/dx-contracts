/* eslint no-console:0 */
module.exports = (artifacts) => {
  const TokenETH = artifacts.require('./EtherToken.sol')
  const TokenGNO = artifacts.require('./TokenGNO.sol')
  const TokenTUL = artifacts.require('./StandardToken.sol')
  const TokenOWL = artifacts.require('./OWL.sol')

  const DutchExchange = artifacts.require('./DutchExchange.sol')
  const PriceOracle = artifacts.require('./PriceOracle.sol')

  // mapping (Contract name => not deployed contract)
  const contracts = {
    TokenETH,
    TokenGNO,
    TokenTUL,
    TokenOWL,
    DutchExchange,
    PriceOracle,
  }

  const shortMap = {
    TokenETH: 'eth',
    TokenGNO: 'gno',
    TokenTUL: 'tul',
    TokenOWL: 'owl',
    DutchExchange: 'dx',
    PriceOracle: 'po',
  }

  const mapToNumber = arr => arr.map(n => (n.toNumber ? n.toNumber() : n))

  /**
   * returns deployed contract mapping
   * @param {object} contrObj - mapping (Contract name => contract)
   */
  const getDeployed = async (contrObj) => {
    const deployedMap = {}

    const promisedDeployed = Object.keys(contrObj).map(async (key) => {
      const ctr = contrObj[key]
      const depCtr = await ctr.deployed()
      deployedMap[shortMap[key]] = depCtr
      return null
    })

    await Promise.all(promisedDeployed)

    return deployedMap
  }

  // Promise<{eth: deployedContract, ...}>
  const deployed = getDeployed(contracts)

  /**
   * helper function that iterates through given tokensMap
   * and does something for token contracts corresponding to eth, gno, ... keys
   * @param {object} tokensMap - mapping (token name lowercase => balance) to deposit, {ETH: balance, ...}
   * @param {function} cb - function to call for each {token: amount} mapping
   * @cb: function({key: TokenCode, token: TokenContract, amount: number})
   */
  const handleTokensMap = async (tokensMap, cb) => {
    const { dx, po, ...tokens } = await deployed

    const promisedDeposits = Object.keys(tokensMap).map(async (key) => {
      const token = tokens[key.toLowerCase()]
      const amount = tokensMap[key]
      // skip for 0 amounts or falsy tokens
      if (!amount || !token) return null

      return cb({ key, token, amount })
    })

    return Promise.all(promisedDeposits)
  }

  /**
   * returns token balances {ETH: balance, ...}
   * @param {string} acc - account to get balances for
   * @returns { ETH: number, GNO: number, TUL: number, OWL: number }
   */
  const getTokenBalances = async (acc) => {
    const { eth, gno, tul, owl } = await deployed
    const balances = await Promise.all([
      eth.balanceOf(acc),
      gno.balanceOf(acc),
      tul.balanceOf(acc),
      owl.balanceOf(acc),
    ])

    const [ETH, GNO, TUL, OWL] = mapToNumber(balances)

    return { ETH, GNO, TUL, OWL }
  }

  /**
   * returns tokens deposited in DutchExchange {ETH: balance, ...}
   * @param {string} acc - account to get token deposits for
   * @returns { ETH: number, GNO: number}
   */
  const getTokenDeposits = async (acc) => {
    const { dx, eth, gno } = await deployed

    const deposits = await Promise.all([
      dx.balances(eth.address, acc),
      dx.balances(gno.address, acc),
    ])

    const [ETH, GNO] = mapToNumber(deposits)

    return { ETH, GNO }
  }

  /**
   * gives tokens to the account, ETH through direct deposit, others from master's balance
   * @param {string} acc - account to give tokens to
   * @param {object} tokensMap - mapping (token name lowercase => balance) to deposit, {ETH: balance, ...}
   * @param {string} masterAcc - master account to transfer tokens (except for ETH) from
   */
  const giveTokens = (acc, tokensMap, masterAcc) => handleTokensMap(tokensMap, ({ key, token, amount }) => {
    if (key === 'ETH') {
      return token.deposit({ from: acc, value: amount })
    } else if (masterAcc) {
      return token.transfer(acc, amount, { from: masterAcc })
    }

    return null
  })

  /**
   * approves transfers and subsequently transfers tokens to DutchExchange
   * @param {string} acc - account in whose name to deposit tokens to DutchExchnage
   * @param {object} tokensMap - mapping (token name lowercase => balance) to deposit, {ETH: balance, ...}
   * @returns deposit transaction | undefined
   */
  const depositToDX = async (acc, tokensMap) => {
    const { dx } = await deployed

    return handleTokensMap(tokensMap, async ({ key, token, amount }) => {
      try {
        await token.approve(dx.address, amount, { from: acc })
        return await dx.deposit(token.address, amount, { from: acc })
      } catch (error) {
        console.warn(`Error depositing ${amount} ${key} from ${acc} to DX`)
        console.warn(error.message || error)
      }
      return undefined
    })
  }

  /**
   * withdraws tokens from DutchExchange and puts them into account balances
   * @param {string} acc - account in whose name to deposit tokens to DutchExchnage
   * @param {object} tokensMap - mapping (token name lowercase => balance) to withdraw, {ETH: balance, ...}
   * @returns withdraw transaction | undefined
   */
  const withrawFromDX = async (acc, tokensMap) => {
    const { dx } = await deployed

    return handleTokensMap(tokensMap, async ({ key, token, amount }) => {
      try {
        return await dx.withdraw(token.address, amount, { from: acc })
      } catch (error) {
        console.warn(`Error withrawing ${amount} ${key} from DX to ${acc}`)
        console.warn(error.message || error)
      }
      return undefined
    })
  }

  /**
   * gets best estimate for market price of a token in ETH
   * @param {TokenCode | address} token - to get price estimate for
   * @returns [num: number, den: number] | undefined
   */
  const priceOracle = async (token, silent) => {
    const { dx } = await deployed

    try {
      const oraclePrice = await dx.priceOracle(token.address || token)
      return mapToNumber(oraclePrice)
    } catch (error) {
      if (silent) return undefined
      console.warn('Error getting oracle price')
      console.warn(error.message || error)
    }

    return undefined
  }

  /**
   * gets state props for a token pair form DutchExchange
   * @param {object} options
   * @options {sellToken: Token | address, buyToken: Token | address}
   * @sellToken, @buyToken - tokens to get stats for
   * @returns {
      sellTokenApproved: boolean,
      buyTokenApproved: boolean,
      sellTokenOraclePrice?: [num: number, den: number],
      buyTokenOraclePrice?: [num: number, den: number],
      buyVolume: number,
      sellVolumeCurrent: number,
      sellVolumeNext: number,
      latestAuctionIndex: number,
      auctionStart: number,
      arbTokens: number,
    }
   */
  const getExchangeStatsForTokenPair = async ({ sellToken, buyToken }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    const [
      sellTokenApproved,
      buyTokenApproved,
      sellTokenOraclePrice,
      buyTokenOraclePrice,
      ...stats
    ] = await Promise.all([
      dx.approvedTokens(t1),
      dx.approvedTokens(t2),
      priceOracle(t1, true),
      priceOracle(t2, true),
      dx.buyVolumes(t1, t2),
      dx.sellVolumesCurrent(t1, t2),
      dx.sellVolumesNext(t1, t2),
      dx.getAuctionIndex(t1, t2),
      dx.getAuctionStart(t1, t2),
      dx.getArbTokens(t1, t2),
    ])

    const [
      buyVolume,
      sellVolumeCurrent,
      sellVolumeNext,
      latestAuctionIndex,
      auctionStart,
      arbTokens,
    ] = mapToNumber(stats)

    return {
      sellTokenApproved,
      buyTokenApproved,
      sellTokenOraclePrice,
      buyTokenOraclePrice,
      buyVolume,
      sellVolumeCurrent,
      sellVolumeNext,
      latestAuctionIndex,
      auctionStart,
      arbTokens,
    }
  }

  /**
   * gets price for a token pair auction at an index from DutchExchange
   * @param {object} options
   * @options {sellToken: Token | address, buyToken: Token | address, index: number}
   * @returns [num: number, den: number] | undefined
   */
  const getPriceForTokenPairAuction = async ({ sellToken, buyToken, index }, silent) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.getAuctionIndex(t1, t2)

    try {
      const price = await dx.getPrice(t1, t2, index)
      return mapToNumber(price)
    } catch (error) {
      if (silent) return undefined
      console.warn('Error getting price')
      console.warn(error.message || error)
    }

    return undefined
  }

  /**
   * gets state props for a token pair action at an index form DutchExchange
   * @param {object} options
   * @options {sellToken: Token | address, buyToken: Token | address, index: number}
   * @sellToken, @buyToken - tokens to get stats for
   * @index - index of auction, latestAuctionIndex by default
   * @returns {
      auctionIndex: number,
      closingPrice: [num: number, den: number],
      price?: [num: number, den: number],
      extraTokens: number,
    }
   */
  const getAuctionStatsForTokenPair = async ({ sellToken, buyToken, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.getAuctionIndex(t1, t2)

    const [closingPrice, price, extraTokens] = await Promise.all([
      dx.closingPrices(t1, t2, index),
      getPriceForTokenPairAuction({ sellToken, buyToken, index }, true),
      dx.extraTokens(t1, t2, index),
    ])

    return {
      auctionIndex: index,
      closingPrice: mapToNumber(closingPrice),
      extraTokens: extraTokens.toNumber(),
      price,
    }
  }

  /**
   * gets state props for a token pair action at an index form DutchExchange
   * also for accounts
   * @param {object} options
   * @options {sellToken: Token | address, buyToken: Token | address, index: number, accounts: Account[]}
   * @sellToken, @buyToken - tokens to get stats for
   * @index - index of auction, latestAuctionIndex by default
   * @accounts - array of accounts
   * @returns {
      [Key: '0xyt23yt24f...']: { sellerBalance: number, buyerBalance: number, claimedAmount: number }
   * }
   */
  const getAccountsStatsForTokenPairAuction = async ({ sellToken, buyToken, index, accounts }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.getAuctionIndex(t1, t2)

    const promisedStatsArray = accounts.map(account => Promise.all([
      dx.sellerBalances(t1, t2, index, account),
      dx.buyerBalances(t1, t2, index, account),
      dx.claimedAmounts(t1, t2, index, account),
    ]))

    const statsArray = await Promise.all(promisedStatsArray)

    return statsArray.reduce((accum, stats, i) => {
      const [sellerBalance, buyerBalance, claimedAmount] = mapToNumber(stats)
      accum[accounts[i]] = { sellerBalance, buyerBalance, claimedAmount }

      return accum
    }, {})
  }

  /**
   * gets state props for a token pair action at an index form DutchExchange
   * also for accounts
   * @param {object} options
   * @options {sellToken: Token | address, buyToken: Token | address, index: number, accounts: Account[]}
   * @sellToken, @buyToken - tokens to get stats for
   * @index - index of auction, latestAuctionIndex by default
   * @accounts - array of accounts
   * @returns {

      sellTokenApproved: boolean,
      buyTokenApproved: boolean,
      sellTokenOraclePrice?: [num: number, den: number],
      buyTokenOraclePrice?: [num: number, den: number],
      buyVolume: number,
      sellVolumeCurrent: number,
      sellVolumeNext: number,
      latestAuctionIndex: number,
      auctionStart: number,
      arbTokens: number,

      auctions: [
        {
          auctionIndex: number, // from latest index to 0
          closingPrice: [num: number, den: number],
          price?: [num: number, den: number],
          extraTokens: number,
          isLatestAuction: boolean,

          accounts: {
            [Key: '0xyt23yt24f...']: { sellerBalance: number, buyerBalance: number, claimedAmount: number }
          }
        }
      ]
   * }
   */
  const getAllStatsForTokenPair = async (options) => {
    const { index, accounts } = options

    const exchangeStats = await getExchangeStatsForTokenPair(options)
    const { latestAuctionIndex } = exchangeStats

    // either array of length 1 with the supplied index, or [3,2,1,0] array if latestIndex === 3
    const auctionIndices = index !== undefined ? [index]
      : Array.from({ length: latestAuctionIndex + 1 }, (v, k) => latestAuctionIndex - k)

    const getAccountStats = accounts && accounts.length

    const promisedStats = auctionIndices.map(async (auctionIndex) => {
      const [auctionStats, accountStats] = await Promise.all([
        getAuctionStatsForTokenPair({ ...options, index: auctionIndex }),
        getAccountStats && getAccountsStatsForTokenPairAuction({ ...options, index: auctionIndex }),
      ])

      return {
        ...auctionStats,
        accounts: accountStats,
        isLatestAuction: auctionIndex === latestAuctionIndex,
      }
    })

    return {
      ...exchangeStats,
      auctions: await Promise.all(promisedStats),
    }
  }

  /**
   * gets some state parameters the exchange  was initialized with
   * @returns {
   * owner: address,
   * ETH: address,
   * ETHUSDOracle: address,
   * TUL: address,
   * OWL: address,
   * thresholdNewTokenPair: number,
   * thresholdNewAuction: number,
   * }
   */
  const getExchangeParams = async () => {
    const { dx } = await deployed

    const [owner, ETH, ETHUSDOracle, TUL, OWL, ...prices] = await Promise.all([
      dx.owner(),
      dx.ETH(),
      dx.ETHUSDOracle(),
      dx.TUL(),
      dx.OWL(),
      dx.thresholdNewTokenPair(),
      dx.thresholdNewAuction(),
    ])

    const [thresholdNewTokenPair, thresholdNewAuction] = mapToNumber(prices)

    return {
      owner,
      ETH,
      ETHUSDOracle,
      TUL,
      OWL,
      thresholdNewTokenPair,
      thresholdNewAuction,
    }
  }

  /**
   * changes some of the parameters the exchange contract was initialized with
   * @param {object} options - only included parameters are changed
   * @options {
     owner: address,
     ETHUSDOracle: address,
     thresholdNewTokenPair: number,
     thresholdNewAuction: number
    }
   * @returns updateExchangeParams transaction
   */
  const updateExchangeParams = async (options) => {
    const { dx } = await deployed
    let {
      owner,
      ETHUSDOracle,
      thresholdNewTokenPair,
      thresholdNewAuction,
    } = options

    let params

    if (owner === undefined
      || ETHUSDOracle === undefined
      || thresholdNewTokenPair === undefined
      || thresholdNewAuction === undefined) {
      params = await getExchangeParams();

      ({
        owner,
        ETHUSDOracle,
        thresholdNewTokenPair,
        thresholdNewAuction,
      } = { ...params, ...options })
    }


    return dx.updateExchangeParams(
      owner,
      ETHUSDOracle,
      thresholdNewTokenPair,
      thresholdNewAuction,
      { from: params.owner },
    )
  }

  /**
   * adds a new token pair auction
   * @param {object} options
   * @options {
      account: address,
      sellToken: Token | address,
      buyToken: Token | address,
      sellTokenFunding: number,
      buyTokenFunding: number,
      initialClosingPriceNum: number,
      initialClosingPriceDen: number,
    }
    @returns addTokenPair transaction | undefined
   */
  const addTokenPair = async ({
    account,
    sellToken,
    buyToken,
    sellTokenFunding,
    buyTokenFunding,
    initialClosingPriceNum,
    initialClosingPriceDen,
  }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      return await dx.addTokenPair(
        t1,
        t2,
        sellTokenFunding,
        buyTokenFunding,
        initialClosingPriceNum,
        initialClosingPriceDen,
        { from: account },
      )
    } catch (error) {
      console.warn('Error adding token pair')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * posts a sell order to a specific token pair auction
   * @param {address} account - account to post sell order from
   * @param {object} options
   * @options {
      sellToken: Token | address,
      buyToken: Token | address,
      index: number,
      amount: number,
    }
    @returns postSellOrder transaction | undefined
   */
  const postSellOrder = async (account, { sellToken, buyToken, index, amount }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      return await dx.postSellOrder(t1, t2, index, amount, { from: account })
    } catch (error) {
      console.warn('Error posting sell order')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * posts a buy order to a specific token pair auction
   * @param {address} account - account to post buy order from
   * @param {object} options
   * @options {
      sellToken: Token | address,
      buyToken: Token | address,
      index: number,
      amount: number,
    }
    @returns postBuyOrder transaction | undefined
   */
  const postBuyOrder = async (account, { sellToken, buyToken, index, amount }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      return await dx.postBuyOrder(t1, t2, index, amount, { from: account })
    } catch (error) {
      console.warn('Error posting buy order')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * claims seller funds from a specific token pair auction for a specific user account
   * claimed funds get added to the given account's deposit
   * @param {object} options
   * @options {
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }
    @returns claimSellerFunds transaction | undefined
   */
  const claimSellerFunds = async ({ sellToken, buyToken, user, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      return await dx.claimSellerFunds(t1, t2, user, index)
    } catch (error) {
      console.warn('Error claiming seller funds')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * claims buyer funds from a specific token pair auction for a specific user account
   * claimed funds get added to the given account's deposit
   * @param {object} options
   * @options {
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }
    @returns claimBuyerrFunds transaction | undefined
   */
  const claimBuyerFunds = async ({ sellToken, buyToken, user, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      return await dx.claimBuyerFunds(t1, t2, user, index)
    } catch (error) {
      console.warn('Error claiming buyer funds')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * gets unclaimed buyer funds from a specific token pair auction for a specific account
   * @param {object} options
   * @options {
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }
    @returns [unclaimedFunds: number, tulipsToIssue: number] | undefined
   */
  const getUnclaimedBuyerFunds = async ({ sellToken, buyToken, user, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      const unclaimedAndTulips = await dx.getUnclaimedBuyerFunds(t1, t2, user, index)
      return mapToNumber(unclaimedAndTulips)
    } catch (error) {
      console.warn('Error getting unclaimed buyer funds')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * gets unclaimed seller funds from a specific token pair auction for a specific account
   * @param {object} options
   * @options {
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }
    @returns [unclaimedFunds: number, tulipsToIssue: number] | undefined
   */
  const getUnclaimedSellerFunds = async ({ sellToken, buyToken, user, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      const unclaimedAndTulips = await dx.getUnclaimedSellerFunds(t1, t2, user, index)
      return mapToNumber(unclaimedAndTulips)
    } catch (error) {
      console.warn('Error getting unclaimed seller funds')
      console.warn(error.message || error)
      return undefined
    }
  }

  return {
    deployed,
    contracts,
    getTokenBalances,
    getTokenDeposits,
    giveTokens,
    depositToDX,
    withrawFromDX,
    getExchangeStatsForTokenPair,
    getAuctionStatsForTokenPair,
    getAccountsStatsForTokenPairAuction,
    getAllStatsForTokenPair,
    getPriceForTokenPairAuction,
    priceOracle,
    getExchangeParams,
    updateExchangeParams,
    addTokenPair,
    postSellOrder,
    postBuyOrder,
    claimSellerFunds,
    claimBuyerFunds,
    getUnclaimedBuyerFunds,
    getUnclaimedSellerFunds,
  }
}
