module.exports = (artifacts) => {
  const TokenETH = artifacts.require('./EtherToken.sol')
  const TokenGNO = artifacts.require('./TokenGNO.sol')
  const TokenTUL = artifacts.require('./StandardToken.sol')
  const TokenOWL = artifacts.require('./OWL.sol')

  const DutchExchange = artifacts.require('./DutchExchange.sol')
  const PriceOracle = artifacts.require('./PriceOracle.sol')

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

  const mapToNumber = arr => arr.map(n => n.toNumber())


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

  const deployed = getDeployed(contracts)

  const handleTokensMap = async (tokensMap, cb) => {
    const { dx, po, ...tokens } = await deployed

    const promisedDeposits = Object.keys(tokensMap).map(async (key) => {
      const token = tokens[key.toLowerCase()]
      const amount = tokensMap[key]

      if (!amount || !token) return null

      return cb({ key, token, amount })
    })

    return Promise.all(promisedDeposits)
  }

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

  const getTokenDeposits = async (acc) => {
    const { dx, eth, gno } = await deployed

    const deposits = await Promise.all([
      dx.balances(eth.address, acc),
      dx.balances(gno.address, acc),
    ])

    const [ETH, GNO] = mapToNumber(deposits)

    return { ETH, GNO }
  }

  const giveTokens = (acc, tokensMap, masterAcc) => handleTokensMap(tokensMap, ({ key, token, amount }) => {
    if (key === 'ETH') {
      return token.deposit({ from: acc, value: amount })
    } else if (masterAcc) {
      return token.transfer(acc, amount, { from: masterAcc })
    }

    return null
  })

  const depositToDX = async (acc, tokensMap) => {
    const { dx } = await deployed

    return handleTokensMap(tokensMap, async ({ key, token, amount }) => {
      try {
        await token.approve(dx.address, amount, { from: acc })
        await dx.deposit(token.address, amount, { from: acc })
      } catch (error) {
        console.warn(`Error depositing ${amount} ${key} from ${acc} to DX`)
        console.warn(error.message || error)
      }
    })
  }

  return {
    deployed,
    contracts,
    getTokenBalances,
    getTokenDeposits,
    giveTokens,
    depositToDX,
  }
}
