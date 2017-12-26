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
   * @options {sellToken: TokenCode | address, buyToke: TokenCode | address}
   * @sellToken, @buyToken - tokens to get stats for
   * @returns {
      sellTokenApproved: boolean,
      buyTokenApproved: boolean,
      sellTokenOraclePrice?: [num: number, den: number],
      buyTokenOraclePrice?: [num: number, den: number],
      latestAuctionIndex: number,
      auctionStart: number,
      arbTokensAdded: number,
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
      dx.latestAuctionIndices(t1, t2),
      dx.auctionStarts(t1, t2),
      dx.arbTokensAdded(t1, t2),
    ])

    const [latestAuctionIndex, auctionStart, arbTokensAdded] = mapToNumber(stats)

    return {
      sellTokenApproved,
      buyTokenApproved,
      sellTokenOraclePrice,
      buyTokenOraclePrice,
      latestAuctionIndex,
      auctionStart,
      arbTokensAdded,
    }
  }

  /**
   * gets price for a token pair auction at an index from DutchExchange
   * @param {object} options
   * @options {sellToken: TokenCode | address, buyToke: TokenCode | address, index: number}
   * @returns [] | undefined
   */
  const getPriceForTokenPairAuction = async ({ sellToken, buyToken, index }, silent) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.latestAuctionIndices(t1, t2)

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
   * @options {sellToken: TokenCode | address, buyToke: TokenCode | address, index: number}
   * @sellToken, @buyToken - tokens to get stats for
   * @index - index of auction, latestAuctionIndex by default
   * @returns {
      auctionIndex: number,
      closingPrice: [num: number, den: number],
      price?: [num: number, den: number],
      sellVolume: number,
      buyVolume: number,
      extraSellTokens: number,
      extraBuyTokens: number,
    }
   */
  const getAuctionStatsForTokenPair = async ({ sellToken, buyToken, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.latestAuctionIndices(t1, t2)

    const [closingPrice, price, ...stats] = await Promise.all([
      dx.closingPrices(t1, t2, index),
      getPriceForTokenPairAuction({ sellToken, buyToken, index }, true),
      dx.sellVolumes(t1, t2, index),
      dx.buyVolumes(t1, t2, index),
      dx.extraSellTokens(t1, t2, index),
      dx.extraBuyTokens(t1, t2, index),
    ])

    const [sellVolume, buyVolume, extraSellTokens, extraBuyTokens] = mapToNumber(stats)

    return {
      auctionIndex: index,
      closingPrice: mapToNumber(closingPrice),
      sellVolume,
      buyVolume,
      extraSellTokens,
      extraBuyTokens,
      price,
    }
  }

  /**
   * gets state props for a token pair action at an index form DutchExchange
   * also for accounts
   * @param {object} options
   * @options {sellToken: TokenCode | address, buyToke: TokenCode | address, index: number, accounts: Account[]}
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

    if (index === undefined) index = await dx.latestAuctionIndices(t1, t2)

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
   * @options {sellToken: TokenCode | address, buyToke: TokenCode | address, index: number, accounts: Account[]}
   * @sellToken, @buyToken - tokens to get stats for
   * @index - index of auction, latestAuctionIndex by default
   * @accounts - array of accounts
   * @returns {

      sellTokenApproved: boolean,
      buyTokenApproved: boolean,
      sellTokenOraclePrice?: [num: number, den: number],
      buyTokenOraclePrice?: [num: number, den: number],
      latestAuctionIndex: number,
      auctionStart: number,
      arbTokensAdded: number,

      auctions: [
        {
          auctionIndex: number, // from latest index to 0
          closingPrice: [num: number, den: number],
          price?: [num: number, den: number],
          sellVolume: number,
          buyVolume: number,
          extraSellTokens: number,
          extraBuyTokens: number,
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

  const getExchangeParams = async () => {
    const { dx } = await deployed

    const [owner, ETH, ETHUSDOracle, TUL, OWL, priceOracleAddress, ...prices] = await Promise.all([
      dx.owner(),
      dx.ETH(),
      dx.ETHUSDOracle(),
      dx.TUL(),
      dx.OWL(),
      dx.priceOracleAddress(),
      dx.sellFundingNewTokenPair(),
      dx.treshholdForNewAuctionstart(),
    ])

    const [sellFundingNewTokenPair, thresholdForNewAuctionstart] = mapToNumber(prices)

    return {
      owner,
      ETH,
      ETHUSDOracle,
      TUL,
      OWL,
      priceOracleAddress,
      sellFundingNewTokenPair,
      thresholdForNewAuctionstart,
    }
  }

  const updateExchangeParams = async (options) => {
    const { dx } = await deployed
    let {
      owner,
      ETHUSDOracle,
      sellFundingNewTokenPair,
      thresholdForNewAuctionstart,
    } = options

    let params

    if (owner === undefined
      || ETHUSDOracle === undefined
      || sellFundingNewTokenPair === undefined
      || thresholdForNewAuctionstart === undefined) {
      params = await getExchangeParams();

      ({
        owner,
        ETHUSDOracle,
        sellFundingNewTokenPair,
        thresholdForNewAuctionstart,
      } = { ...params, ...options })
    }


    return dx.updateExchangeParams(
      owner,
      ETHUSDOracle,
      sellFundingNewTokenPair,
      thresholdForNewAuctionstart,
      { from: params.owner },
    )
  }

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
  }
}
