/* eslint no-console:0 */

module.exports = (artifacts) => {
  const TokenETH = artifacts.require('./EtherToken')
  const TokenGNO = artifacts.require('./TokenGNO')
  const TokenFRT = artifacts.require('./TokenFRT')
  const TokenOMG = artifacts.require('TokenOMG')
  const TokenRDN = artifacts.require('TokenRDN')

  const TokenOWLProxy = artifacts.require('./TokenOWLProxy')
  const TokenOWL = artifacts.require('./TokenOWL')

  const Proxy = artifacts.require('./DutchExchangeProxy')
  const DutchExchange = artifacts.require('./DutchExchange')

  const PriceOracleInterface = artifacts.require('./PriceOracleInterface')
  const PriceFeed = artifacts.require('./PriceFeed')
  const Medianizer = artifacts.require('./Medianizer')

  /**
 * @typedef {"ETH"|"GNO"|"FRT"|"OWL"} TokenCode - token symbol
 */
  /**
 * @typedef {object} Contract - deployed contract type
 */
  /**
 * @typedef {string} address - deployed contract type
 */

  // mapping (Contract name => not deployed contract)
  /**
 * A map-like object that maps arbitrary `string` properties to `number`s.
 *
 * @type {Object.<string, Contract>}
 */
  const contracts = {
    TokenETH,
    TokenGNO,
    TokenFRT,
    TokenOWL,
    TokenOWLProxy,
    DutchExchange,
    Proxy,
    PriceOracleInterface,
    PriceFeed,
    Medianizer,
  }

  const shortMap = {
    TokenETH: 'eth',
    TokenGNO: 'gno',
    TokenFRT: 'frt',
    TokenOMG: 'omg',
    TokenRDN: 'rdn',
    TokenOWL: 'owl',
    TokenOWLProxy: 'owlProxy',
    DutchExchange: 'dx',
    Proxy: 'proxy',
    PriceOracleInterface: 'po',
    PriceFeed: 'pf',
    Medianizer: 'mn',
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

    deployedMap[shortMap.TokenOWL] = await TokenOWL.at(TokenOWLProxy.address)
    deployedMap[shortMap.DutchExchange] = await artifacts.require('DutchExchange').at(Proxy.address)
    deployedMap[shortMap.TokenOMG] = await TokenOMG.new(5000000e18)
    deployedMap[shortMap.TokenRDN] =await TokenRDN.new(5000000e18)
    // remove extra non-tokens
    // delete deployedMap.owlProxy
    // delete deployedMap.proxy
    // delete deployedMap.pf
    // delete deployedMap.mn
    return deployedMap
  }

  /**
 * @typedef {Object} DeployedContract - deployed contract type
 */

  /**
 * @typedef {Object} DeployedContracts - deployed contracts map
 * @prop {DeployedContract} eth - deployed EtherToken contract
 * @prop {DeployedContract} gno - deployed TokenGNO contract
 * @prop {DeployedContract} frt - deployed TokenFRT contract
 * @prop {DeployedContract} rdn - deployed TokenRDN contract
 * @prop {DeployedContract} omg - deployed TokenOMG contract
 * @prop {DeployedContract} owl - deployed TokenOWL contract (proxy)
 * @prop {DeployedContract} dx - deployed DutchExchange contract (proxy)
 * @prop {DeployedContract} po - deployed PriceOracleInterface contract
 */
  /** @type {Promise<DeployedContracts>} */
  const

deployed = getDeployed(contracts)

  /**
   * helper function that iterates through given tokensMap
   * and does something for token contracts corresponding to eth, gno, ... keys
   * @param {{[T in TokenCode]: number}} tokensMap - mapping (token name lowercase => balance), {ETH: balance, ...}
   * @param {function({key: TokenCode, token: TokenContract, amount: number})} cb - call for each {token: amount}
   */
  const handleTokensMap = async (tokensMap, cb) => {
    const { dx, po, ...tokens } = await deployed

    const promisedDeposits = Object.keys(tokensMap).map((key) => {
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
   * @returns {{ ETH: number, GNO: number, FRT: number, OWL: number }}
   */
  const getTokenBalances = async (acc) => {
    const { eth, gno, frt, rdn, omg, owl } = await deployed
    const balances = await Promise.all([
      eth.balanceOf(acc),
      gno.balanceOf(acc),
      frt.balanceOf(acc),
      omg.balanceOf(acc),
      rdn.balanceOf(acc),
      owl.balanceOf(acc),
    ])

    const [ETH, GNO, FRT, OMG, RDN, OWL] = mapToNumber(balances)

    return { ETH, GNO, FRT, OMG, RDN, OWL }
  }

  /**
   * returns tokens deposited in DutchExchange {ETH: balance, ...}
   * @param {string} acc - account to get token deposits for
   * @returns {{ ETH: number, GNO: number, FRT: number, GNO: number }}
   */
  const getTokenDeposits = async (acc) => {
    const { dx, eth, gno, rdn, omg, frt, owl } = await deployed

    const deposits = await Promise.all([
      dx.balances.call(eth.address, acc),
      dx.balances.call(gno.address, acc),
      dx.balances.call(frt.address, acc),
      dx.balances.call(rdn.address, acc),
      dx.balances.call(omg.address, acc),
      dx.balances.call(owl.address, acc),
    ])

    const [ETH, GNO, FRT, OMG, RDN, OWL] = mapToNumber(deposits)

    return { ETH, GNO, FRT, OMG, RDN, OWL }
  }

  /**
   * gives tokens to the account, ETH through direct deposit, others from master's balance
   * @param {string} acc - account to give tokens to
   * @param {{[T in TokenCode]: number}} tokensMap - mapping (token name lowercase => balance), {ETH: balance, ...}
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
   * approves (gives allowance) transfers of tokens to DutchExchange
   * @param {string} acc - account in whose name to deposit tokens to DutchExchnage
   * @param {{[T in TokenCode]: number}} tokensMap - mapping (token name lowercase => balance), {ETH: balance, ...}
   * @returns deposit transaction | undefined
   */
  const approveForDX = async (acc, tokensMap) => {
    const { dx } = await deployed

    return handleTokensMap(tokensMap, async ({ key, token, amount }) => {
      try {
        return await token.approve(dx.address, amount, { from: acc })
      } catch (error) {
        console.warn(`Error approving allowance ${amount} ${key} from ${acc} to DX`)
        console.warn(error.message || error)
      }
      return undefined
    })
  }
  /**
   * approves transfers and subsequently transfers tokens to DutchExchange
   * @param {string} acc - account in whose name to deposit tokens to DutchExchnage
   * @param {{[T in TokenCode]: number}} tokensMap - mapping (token name lowercase => balance), {ETH: balance, ...}
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
   * @param {TokenCode | string} token - to get price estimate for
   * @returns [num: number, den: number] | undefined
   */
  const priceOracle = async (token, silent) => {
    const { dx } = await deployed

    try {

const oraclePrice = await dx.getPriceOracleForJS.call(token.address || token)
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
   * @returns {{
      sellTokenApproved: boolean,
      buyTokenApproved: boolean,
      sellTokenOraclePrice?: [num: number, den: number],
      buyTokenOraclePrice?: [num: number, den: number],
      buyVolume: number,
      sellVolumeCurrent: number,
      sellVolumeNext: number,
      latestAuctionIndex: number,
      auctionStart: number,
    }}
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
      dx.approvedTokens.call(t1),
      dx.approvedTokens.call(t2),
      priceOracle(t1, true),
      priceOracle(t2, true),
      dx.buyVolumes.call(t1, t2),
      dx.sellVolumesCurrent.call(t1, t2),
      dx.sellVolumesNext.call(t1, t2),
      dx.getAuctionIndex.call(t1, t2),
      dx.getAuctionStart.call(t1, t2),
    ])

    const [
      buyVolume,
      sellVolumeCurrent,
      sellVolumeNext,
      latestAuctionIndex,
      auctionStart,
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
    }
  }

  /**
   * gets price for a token pair auction at an index from DutchExchange
   * @param {{sellToken: Token | string, buyToken: Token | string, index: number}}
   * @returns {[num: number, den: number] | undefined}
   */
  const getPriceForTokenPairAuction = async ({ sellToken, buyToken, index }, silent) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.getAuctionIndex(t1, t2)

    try {
      const price = await dx.getPriceForJS.call(t1, t2, index)
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
   * @param {{sellToken: Token | string, buyToken: Token | string, index: number}}

   * @returns {{
      auctionIndex: number,
      closingPrice: [num: number, den: number],
      price?: [num: number, den: number],
      extraTokens: number,
    }}
   */
  const getAuctionStatsForTokenPair = async ({ sellToken, buyToken, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.getAuctionIndex(t1, t2)

    const [closingPrice, price, extraTokens] = await Promise.all([
      dx.closingPrices.call(t1, t2, index),
      getPriceForTokenPairAuction({ sellToken, buyToken, index }, true),
      dx.extraTokens.call(t1, t2, index),
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
   * @param {{sellToken: Token | string, buyToken: Token | string, index: number, accounts: Account[]}} options
   * @returns {{
      [Key: string]: { sellerBalance: number, buyerBalance: number, claimedAmount: number }
   * }}
   */
  const getAccountsStatsForTokenPairAuction = async ({ sellToken, buyToken, index, accounts }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    if (index === undefined) index = await dx.getAuctionIndex.call(t1, t2)

    const promisedStatsArray = accounts.map(account => Promise.all([
      dx.sellerBalances.call(t1, t2, index, account),
      dx.buyerBalances.call(t1, t2, index, account),
      dx.claimedAmounts.call(t1, t2, index, account),
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
   * @param {{sellToken: Token | address, buyToken: Token | address, index: number, accounts: Account[]}} options
   * @options {sellToken: Token | address, buyToken: Token | address, index: number, accounts: Account[]}
   * @returns {{
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
            [Key: string]: { sellerBalance: number, buyerBalance: number, claimedAmount: number }
          }
        }
      ]
   * }}
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
   * @returns {{
    auctioneer: address,
    ETH: address,
    ETHUSDOracle: address,
    FRT: address,
    OWL: address,
    thresholdNewTokenPair: number,
    thresholdNewAuction: number,
    }}
   */
  const getExchangeParams = async () => {
    const { dx } = await deployed

    const [auctioneer, ETH, ETHUSDOracle, FRT, OWL, ...prices] = await Promise.all([
      dx.auctioneer.call(),
      dx.ethToken.call(),
      dx.ethUSDOracle.call(),
      dx.frtToken.call(),
      dx.owlToken.call(),
      dx.thresholdNewTokenPair.call(),
      dx.thresholdNewAuction.call(),
    ])

    const [thresholdNewTokenPair, thresholdNewAuction] = mapToNumber(prices)

    return {
      auctioneer,
      ETH,
      ETHUSDOracle,
      FRT,
      OWL,
      thresholdNewTokenPair,
      thresholdNewAuction,
    }
  }

  /**
   * changes some of the parameters the exchange contract was initialized with
   * @param {object} options - only included parameters are changed
   * @options {
     auctioneer: address,
     ETHUSDOracle: address,
     thresholdNewTokenPair: number,
     thresholdNewAuction: number
    }
   * @returns updateExchangeParams transaction
   */
  const updateExchangeParams = async (options) => {
    const { dx } = await deployed
    let {
      auctioneer,
      thresholdNewTokenPair,
      thresholdNewAuction,
    } = options

    let params

    if (auctioneer === undefined
      || thresholdNewTokenPair === undefined
      || thresholdNewAuction === undefined) {
      params = await getExchangeParams();

      ({
        auctioneer,
        thresholdNewTokenPair,
        thresholdNewAuction,
      } = { ...params, ...options })
    }

    return Promise.all([
      dx.updateAuctioneer(auctioneer, { from: params.auctioneer }),
      dx.updateThresholdNewTokenPair(thresholdNewTokenPair, { from: params.auctioneer }),
      dx.updateThresholdNewAuction(thresholdNewAuction, { from: params.auctioneer }),
    ])
  }

  /**
   * adds a new token pair auction
   * @param {{
      account: address,
      sellToken: Token | address,
      buyToken: Token | address,
      sellTokenFunding: number,
      buyTokenFunding: number,
      initialClosingPriceNum: number,
      initialClosingPriceDen: number,
    }}


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
   * @param {{
      sellToken: Token | address,
      buyToken: Token | address,
      index: number = 0,
      amount: number,
    }}
    options
    @returns postSellOrder transaction | undefined
   */
  const postSellOrder = async (account, { sellToken, buyToken, index = 0, amount }) => {
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
   * deposits an amount and posts a sell order fro that amount to a specific token pair auction
   * @param {address} account - account to post sell order from
   * @param {{
      sellToken: Token | address,
      buyToken: Token | address,
      amount: number,
    }}
    options
    @returns postSellOrder transaction | undefined
   */
  const depositAndSell = async (account, { sellToken, buyToken, amount }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      return await dx.depositAndSell(t1, t2, amount, { from: account })
    } catch (error) {
      console.warn('Error posting deposit and sell order')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * posts a buy order to a specific token pair auction
   * @param {address} account - account to post buy order from
   * @param {{
      sellToken: Token | address,
      buyToken: Token | address,
      index: number,
      amount: number,
    }} options
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
   * @param {{
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }} options
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
   * @param {{
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }} options
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
   * @param {{
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }} options
    @returns {[unclaimedFunds: number, tulipsToIssue: number] | undefined}
   */
  const getUnclaimedBuyerFunds = async ({ sellToken, buyToken, user, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      // WARNING: breaks
      const unclaimedAndTulips = await dx.claimBuyerFunds.call(t1, t2, user, index)
      return mapToNumber(unclaimedAndTulips)
    } catch (error) {
      console.warn('Error getting unclaimed buyer funds')
      console.warn(error.message || error)
      return undefined
    }
  }

  /**
   * gets unclaimed seller funds from a specific token pair auction for a specific account
   * @param {{
      sellToken: Token | address,
      buyToken: Token | address,
      user: address,
      index: number,
    }}
    options
    @returns {[unclaimedFunds: number, tulipsToIssue: number] | undefined}
   */
  const getUnclaimedSellerFunds = async ({ sellToken, buyToken, user, index }) => {
    const t1 = sellToken.address || sellToken
    const t2 = buyToken.address || buyToken

    const { dx } = await deployed

    try {
      const unclaimedAndTulips = await dx.claimSellerFunds.call(t1, t2, user, index)
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
    approveForDX,
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
    depositAndSell,
    postBuyOrder,
    claimSellerFunds,
    claimBuyerFunds,
    getUnclaimedBuyerFunds,
    getUnclaimedSellerFunds,
  }
}
