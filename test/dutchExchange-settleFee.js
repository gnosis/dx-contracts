const {
  eventWatcher,
  gasLogger,
  logger,
  log,
  enableContractFlag,
} = require('./utils')

const { getContracts, setupTest } = require('./testFunctions')

const POWL = artifacts.require('TokenOWLProxy')
const InternalTests = artifacts.require('InternalTests')
// Test VARS
let eth
let gno
let mgn
let owl
let dx
let oracle
let dxOld
let owlA
let contracts


const getExchangeParams = async (dxContr = dx) => {
  const [frtToken,
    owlToken,
    auctioneer,
    eth,
    ethUSDOracle,
    thresholdNewTokenPair,
    thresholdNewAuction] = await Promise.all([
    dxContr.frtToken.call(),
    dxContr.owlToken.call(),
    dxContr.auctioneer.call(),
    dxContr.ethToken.call(),
    dxContr.ethUSDOracle.call(),
    dxContr.thresholdNewTokenPair.call(),
    dxContr.thresholdNewAuction.call(),
  ])

  return [
    frtToken,
    owlToken,
    auctioneer,
    eth,
    ethUSDOracle,
    thresholdNewTokenPair.toNumber(),
    thresholdNewAuction.toNumber(),
  ]
}

const separateLogs = () => log('\n    ----------------------------------')

const getHelperFunctions = (master) => {
  const getTotalMGN = async (print = true) => {
    const totalMgn = (await mgn.totalSupply.call()).toNumber()
    if (print) log(`\taccount's total MGN == ${totalMgn}`)

    return totalMgn
  }

  const getLockedMGN = async (account, print = true) => {
    const lockedMgn = (await mgn.lockedTokenBalances.call(account)).toNumber()
    if (print) log(`\taccount's locked MGN == ${lockedMgn}`)

    return lockedMgn
  }

  const unlockMGN = (account, amount) => mgn.unlockTokens(amount, { from: account })

  const mintTokens = (account, amount) => mgn.mintTokens(account, amount, { from: master })

  const calculateFeeRatio = async (account, print = true) => {
    const [num, den] = (await dx.getFeeRatioForJS.call(account)).map(n => n.toNumber())
    if (print) log(`\tfeeRatio == ${((num / den) * 100).toFixed(2)}% == ${num}/${den} == ${num / den}`)

    return [num, den]
  }

  const getHowManyToAdd = (totalMgn, lockedMGNBalance, percent) =>
    Math.round((totalMgn - (lockedMGNBalance / percent)) / ((1 / percent) - 1))

  // mint MGN to make account have a given percent of total MGN
  const mintPercent = async (account, percent) => {
    const totalMgn = await getTotalMGN(false)
    const lockedMGNBalance = await getLockedMGN(account, false)
    // calculate how much is left to reach the given percent
    let toMint = getHowManyToAdd(totalMgn, lockedMGNBalance, percent)

    // if given percent < current percent
    if (toMint < 0) {
      // need to add to total MGN
      // mint for master
      account = master
      toMint = (lockedMGNBalance / percent) - totalMgn
    }
    return mintTokens(account, toMint)
  }

  return {
    getTotalMGN,
    getLockedMGN,
    unlockMGN,
    mintTokens,
    calculateFeeRatio,
    getHowManyToAdd,
    mintPercent,
  }
}

const c1 = () => contract('DutchExchange - calculateFeeRatio', (accounts) => {
  const [master, seller1] = accounts
  const testingAccs = accounts.slice(1, 5)

  const ETHBalance = 20.0.toWei()

  const GNOBalance = 15.0.toWei()

  beforeEach(separateLogs)

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      // DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenFRT: mgn,
      // using internal contract with settleFeePub calling dx.settleFee internally
      DutchExchange: dxOld,
    } = contracts)


    const initParams = await getExchangeParams(dxOld)
    dx = await InternalTests.new(...initParams)
    contracts.DutchExchange = dx

    // set up initial balances for accounts and allowance for dx in accounts' names
    await Promise.all(testingAccs.map(acct => Promise.all([
      eth.deposit({ from: acct, value: ETHBalance }),
      eth.approve(dx.address, ETHBalance, { from: acct }),
      gno.transfer(acct, GNOBalance, { from: master }),
      gno.approve(dx.address, GNOBalance, { from: acct }),
    ])))

    await mgn.updateMinter(master, { from: master })
  })

  afterEach(gasLogger)
  after(eventWatcher.stopWatching)

  const {
    getTotalMGN,
    getLockedMGN,
    mintTokens,
    calculateFeeRatio,
    mintPercent,
  } = getHelperFunctions(master)

  it('feeRatio == 0.5% when total MGN == 0', async () => {
    const totalMgn = await getTotalMGN()

    assert.strictEqual(totalMgn, 0, 'initially no MGN tokens')
    const [num, den] = await calculateFeeRatio(seller1)
    assert.strictEqual(num / den, 0.005, 'feeRatio is 0.5% when total MGN tokens == 0')
  })

  it('feeRatio == 0.5% when total MGN > 0 and account has 0 MGN', async () => {
    await mintTokens(master, 1000)
    const totalMgn = await getTotalMGN()

    assert.strictEqual(totalMgn, 1000, 'there are available total MGN tokens')

    const lockedMGNBalance = await getLockedMGN(seller1)
    assert.strictEqual(lockedMGNBalance, 0, 'seller doesn\'t have MGN balance')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.strictEqual(num / den, 0.005, 'feeRatio is 0.5% when total MGN tokens > 0 but account\'s MGN balance == 0')
  })

  it('feeRatio == 0.4% when account has 0.00005 of total MGN', async () => {
    await mintTokens(master, 1000000)

    await mintPercent(seller1, 0.00005)

    const totalMgn = await getTotalMGN()
    assert.isAbove(totalMgn, 0, 'there are available total MGN tokens')

    const lockedMGNBalance = await getLockedMGN(seller1)
    assert.strictEqual(lockedMGNBalance, Math.round(totalMgn * 0.00005), 'seller has 1% of total MGN')

    const [num, den] = await calculateFeeRatio(seller1)
    // round feeRatio a bit
    assert.equal((num / den).toFixed(4), 0.004, 'feeRatio is 0.4% when total MGN tokens > 0 ')
  })

  it('feeRatio == 0.3% when account has 0.0005 of total MGN', async () => {
    await mintPercent(seller1, 0.0005)

    const totalMgn = await getTotalMGN()
    assert.isAbove(totalMgn, 0, 'there are available total MGN tokens')

    const lockedMGNBalance = await getLockedMGN(seller1)
    assert.strictEqual(lockedMGNBalance, Math.round(totalMgn * 0.0005), 'seller has 1% of total MGN')

    const [num, den] = await calculateFeeRatio(seller1)
    // round feeRatio a bit
    assert.equal((num / den).toFixed(4), 0.003, 'feeRatio is 0.3% when total MGN tokens > 0')
  })

  it('feeRatio == 0.2% when account has 0.005 of total MGN', async () => {
    await mintPercent(seller1, 0.005)

    const totalMgn = await getTotalMGN()
    assert.isAbove(totalMgn, 0, 'there are available total MGN tokens')

    const lockedMGNBalance = await getLockedMGN(seller1)
    assert.strictEqual(lockedMGNBalance, Math.round(totalMgn * 0.005), 'seller has 1% of total MGN')

    const [num, den] = await calculateFeeRatio(seller1)
    // round feeRatio a bit
    assert.equal((num / den).toFixed(4), 0.0020, 'feeRatio is 0.20% when total MGN tokens > 0 ')
  })

  it('feeRatio == 0.1% when account has 0.05 of total MGN', async () => {
    await mintPercent(seller1, 0.05)

    const totalMgn = await getTotalMGN()
    assert.isAbove(totalMgn, 0, 'there are available total MGN tokens')

    const lockedMGNBalance = await getLockedMGN(seller1)
    assert.strictEqual(lockedMGNBalance, Math.round(totalMgn * 0.05), 'seller has 1% of total MGN')

    const [num, den] = await calculateFeeRatio(seller1)
    // round feeRatio a bit
    assert.equal((num / den).toFixed(4), 0.0010, 'feeRatio is 0.10% when total MGN tokens > 0 ')
  })

  it('feeRatio == 0% when account has >= 10% of total MGN', async () => {
    await mintPercent(seller1, 0.11)

    const totalMgn2 = await getTotalMGN()
    assert.isAbove(totalMgn2, 0, 'there are available total MGN tokens')

    const lockedMGNBalance2 = await getLockedMGN(seller1)
    assert.isAtLeast(lockedMGNBalance2, Math.round(totalMgn2 * 0.1), 'seller has >= 10% of total MGN')

    const [num, den] = await calculateFeeRatio(seller1)
    assert.equal(num / den, 0, 'feeRatio is 0% when total MGN tokens > 0 but account\'s MGN balance == 10% total MGN')
  })
})

const c2 = () => contract('DutchExchange - settleFee', (accounts) => {
  const [master, seller1] = accounts

  const startBal = {
    startingETH: 90.0.toWei(),
    startingGNO: 90.0.toWei(),
    ethUSDPrice: 1008.0.toWei(),
    sellingAmount: 50.0.toWei(),
  }

  const ETHBalance = 20.0.toWei()

  beforeEach(separateLogs)

  before(async () => {
    // get contracts
    contracts = await getContracts();
    // destructure contracts into upper state
    ({
      // DutchExchange: dx,
      EtherToken: eth,
      TokenGNO: gno,
      TokenFRT: mgn,
      TokenOWL: owl,
      OWLAirdrop: owlA,
      // using internal contract with settleFeePub calling dx.settleFee internally
      DutchExchange: dxOld,
      PriceOracleInterface: oracle,
    } = contracts)


    const initParams = await getExchangeParams(dxOld)
    dx = await InternalTests.new(...initParams)
    contracts.DutchExchange = dx

    await setupTest(accounts, contracts, startBal)

    //generatae OWL

      gno.approve(owlA.address, 50000 * (10 ** 18))
      owlA.lockGNO(50000 * (10 ** 18))

    const depositETH = async (amt, acct) => {
      await eth.deposit({ from: acct, value: amt })
      await eth.approve(dx.address, amt, { from: acct })

      await dx.deposit(eth.address, amt, { from: acct })
    }

    // deposit ETHER into EtherToken, approve DX and ..
    // deposit ETHER into DX
    await depositETH(ETHBalance, seller1)


    await mgn.updateMinter(dx.address,{from: master})
    /*// add tokenPair ETH GNO
    await dx.addTokenPair(
      eth.address,
      gno.address,
      (ETHBalance / 2), // 10 ETH
      0,
      2,
      1,
      { from: seller1 },
    )*/

    await mgn.updateMinter(master, { from: master })
    logger('PRICE ORACLE', await oracle.getUSDETHPrice.call())


    eventWatcher(dx, 'LogNumber')
  })

  after(eventWatcher.stopWatching)

  /**
   * Internally calls DutchExchange.settleFee
   * @args Array of:
   * @param {address} primaryToken
   * @param {address} secondaryToken
   * @param {uint} auctionIndex
   * @param {address} user
   * @param {uint} amount
   */
  const settleFee = async (...args) => {
    log(`\t tx : settling fee for ${args[4]} amount of tokens\n\t*`)
    const amountAfterFee = await dx.settleFeePub(...args)
    return amountAfterFee
  }

  settleFee.call = async (...args) => {
    const amountAfterFee = (await dx.settleFeePub.call(...args)).toNumber()
    log(`\t*\n\t given ${args[4]} amount of tokens`)
    log(`\t calculated amountAfterFee == ${amountAfterFee}`)

    return amountAfterFee
  }

  const {
    getTotalMGN,
    getLockedMGN,
    unlockMGN,
    mintTokens,
    mintPercent,
    calculateFeeRatio,
  } = getHelperFunctions(master)

  const ensureTotalMGN = async () => {
    const totalMgn = await getTotalMGN()
    if (totalMgn === 0) {
      await mintTokens(master, 1000)
    }
  }

  const feeRatioShortcuts = {
    '0%': async (account) => {
      let [num, den] = await calculateFeeRatio(account, false)
      let feeRatio = num / den
      if (feeRatio === 0) return feeRatio

      // fee is 0% when account has >= 10% of total MGN
      await ensureTotalMGN()
      await mintPercent(account, 0.11);

      ([num, den] = await calculateFeeRatio(account))
      feeRatio = num / den
      assert.equal(feeRatio, 0, 'feeRatio is 0% when total MGN tokens > 0 and account\'s MGN balance >= 10% total MGN')

      return feeRatio
    },
    '0.5%': async (account) => {
      let [num, den] = await calculateFeeRatio(account, false)
      let feeRatio = num / den
      if (feeRatio === 0.005) return feeRatio

      const totalMgn = await getTotalMGN()
      // fee is 0.5% when
      // either total MGN == 0
      // or total MGN > 0, but account has no MGN
      if (totalMgn > 0) {
        const lockedMGNBalance = await getLockedMGN(account)
        // get rid of lockedMGN if any
        if (lockedMGNBalance > 0) {
          await unlockMGN(account, lockedMGNBalance)
        }
      }

      ([num, den] = await calculateFeeRatio(account))
      feeRatio = num / den
      assert.strictEqual(feeRatio, 0.005, 'feeRatio is 0.5% when total MGN tokens > 0 but account\'s MGN balance == 0')

      return feeRatio
    },
    '0.25%': async (account) => {
      let [num, den] = await calculateFeeRatio(account, false)
      let feeRatio = num / den
      if (feeRatio.toFixed(4) === 0.0025) return feeRatio

      // fee is 0.25% when account has 1% of total MGN
      await ensureTotalMGN()

      await mintPercent(account, 0.01);

      ([num, den] = await calculateFeeRatio(account))
      feeRatio = num / den
      // round feeRatio a bit
      assert.equal(feeRatio.toFixed(4), 0.0025, 'feeRatio is 0.25% when total MGN tokens > 0 but account\'s MGN balance == 1% total MGN')

      return feeRatio
    },
  }

  /**
   * Sets MGN tokens so that feeRatio would be 0, 0.5 or 0.25 %
   * @param {0 | 0.5 | 0.25} percent
   * @param {address} account
   */
  const makeFeeRatioPercent = (percent, account) => {
    if (typeof percent === 'number' || !percent.endsWith('%')) percent += '%'
    const shortcut = feeRatioShortcuts[percent]

    assert.isOk(shortcut, `No shortcut for setting feeRatio to ${percent}`)

    return shortcut(account)
  }

  const getExtraTokens = async (primaryToken, secondaryToken, auctionIndex) => {
    const extraTokens = (await dx.extraTokens.call(primaryToken, secondaryToken, auctionIndex + 1)).toNumber()

    log(`\textraTokens == ${extraTokens}`)
    return extraTokens
  }
  // returns number as BigInt
  const getExtraTokens2 = async (primaryToken, secondaryToken, auctionIndex) => {
    const extraTokens = (await dx.extraTokens.call(primaryToken, secondaryToken, auctionIndex + 1))

    log(`\textraTokens == ${extraTokens}`)
    return extraTokens
  }

  // fee is uint, so use Math.floor
  const calculateFee = (amount, feeRatio, print = true) => {
    const fee = Math.floor(amount * feeRatio)
    if (print) log(`\tfee == ${fee}`)

    return fee
  }

  const calculateFeeInUSD = async (fee, token) => {
    const [ETHUSDPrice, [num, den]] = await Promise.all([
      oracle.getUSDETHPrice.call(),
      dx.getPriceOfTokenInLastAuction.call(token),
    ])

    const feeInETH = calculateFee(fee, num.toNumber() / den.toNumber(), false)
    return calculateFee(feeInETH, ETHUSDPrice.toNumber(), false)
  }

  const adjustFee = (fee, amountOfOWLBurned, feeInUSD) => {
    const adjustedFee = Math.floor(fee - Math.floor((amountOfOWLBurned * fee) / feeInUSD))
    log(`\tadjusted fee == ${adjustedFee}`)

    return adjustedFee
  }


  it('amountAfterFee == amount when fee == 0', async () => {
    await makeFeeRatioPercent(0, seller1)

    const amount = 10
    const auctionIndex = 1

    const extraTokens1 = await getExtraTokens(eth.address, gno.address, auctionIndex)

    const amountAfterFee = await settleFee
      .call(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })

    assert.strictEqual(amountAfterFee, amount, 'amount should not change when fee == 0')

    await settleFee(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })
    const extraTokens2 = await getExtraTokens(eth.address, gno.address, auctionIndex)

    assert.strictEqual(extraTokens1, extraTokens2, 'extraTokens should not change when fee == 0')
  })

  it('amountAfterFee == amount - fee when fee > 0 and account\'s OWL == 0', async () => {
    const owlBalance = (await owl.balanceOf(seller1)).toNumber()

    assert.strictEqual(owlBalance, 0, 'initially OWL balance should be 0')

    const feeRatio = await makeFeeRatioPercent(0.5, seller1)

    const amount = 1000
    const auctionIndex = 1

    const extraTokens1 = await getExtraTokens(eth.address, gno.address, auctionIndex)

    const fee = calculateFee(amount, feeRatio)

    assert.isAbove(fee, 0, 'fee must be > 0')

    const amountAfterFee = await settleFee
      .call(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })
    assert.strictEqual(amountAfterFee, amount - fee, 'amount should be decreased by fee')

    await settleFee(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })
    const extraTokens2 = await getExtraTokens(eth.address, gno.address, auctionIndex)


    assert.strictEqual(extraTokens1 + fee, extraTokens2, 'extraTokens should be increased by fee')
  })

  it('amountAfterFee == amount - fee(adjusted) when fee > 0 and account\'s OWL < feeInUSD / 2', async () => {
    const feeRatio = await makeFeeRatioPercent(0.5, seller1)

    const amount = 1000
    let fee = calculateFee(amount, feeRatio)
    const feeInUSD = await calculateFeeInUSD(fee, eth.address)

    const owlAmount = Math.floor(feeInUSD / 2) - 1
    await owl.transfer(seller1, owlAmount, { from: master })
    const owlBalance1 = (await owl.balanceOf(seller1)).toNumber()
    assert.strictEqual(owlBalance1, owlAmount, 'account should have OWL balance < feeInUSD / 2 and OWL balance == approved Tokens')
    assert.isAbove(owlBalance1, 0, 'account should have OWL balance > 0')

    await owl.approve(dx.address, owlAmount, { from: seller1 })
    const amountOfOWLBurned = owlBalance1

    fee = adjustFee(fee, amountOfOWLBurned, feeInUSD)
    assert.isAbove(fee, 0, 'fee must be > 0')

    const auctionIndex = 1

    const extraTokens1 = await getExtraTokens(eth.address, gno.address, auctionIndex)

    const amountAfterFee = await settleFee
      .call(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })

    assert.strictEqual(amountAfterFee, amount - fee, 'amount should be decreased by fee')

    await settleFee(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })
    const extraTokens2 = await getExtraTokens(eth.address, gno.address, auctionIndex)

    assert.strictEqual(extraTokens1 + fee, extraTokens2, 'extraTokens should be increased by fee')

    const owlBalance2 = (await owl.balanceOf(seller1)).toNumber()
    log(`\tburned OWL == ${amountOfOWLBurned}`)

    assert.strictEqual(owlBalance2, owlBalance1 - amountOfOWLBurned, 'some OWL should have been burned')
    assert.strictEqual(owlBalance2, 0, 'all OWL should be burned as it was < feeInUSD/2 and all used up')
  })

  it('amountAfterFee == amount - fee(adjusted) when fee > 0 and account\'s OWL > feeInUSD / 2', async () => {
    const feeRatio = await makeFeeRatioPercent(0.5, seller1)

    const amount = 1000
    let fee = calculateFee(amount, feeRatio)
    const feeInUSD = await calculateFeeInUSD(fee, eth.address)

    const owlAmount = Math.floor(feeInUSD / 2) + 10

    await owl.transfer(seller1, owlAmount, { from: master })

    const owlBalance1 = (await owl.balanceOf(seller1)).toNumber()

    assert.strictEqual(owlBalance1, owlAmount, 'account should have OWL balance > feeInUSD / 2')


    await owl.approve(dx.address, owlAmount * 5, { from: seller1 })

    const amountOfOWLBurned = Math.min( Math.floor(feeInUSD / 2), owlAmount);
    fee = adjustFee(fee, amountOfOWLBurned, feeInUSD)
    assert.isAbove(fee, 0, 'fee must be > 0')


    const auctionIndex = 1

    const extraTokens1 = await getExtraTokens(eth.address, gno.address, auctionIndex)

    const amountAfterFee = await settleFee
      .call(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })

    assert.strictEqual(amountAfterFee, amount - fee, 'amount should be decreased by fee')

    await settleFee(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })
    const extraTokens2 = await getExtraTokens(eth.address, gno.address, auctionIndex)
    assert.strictEqual(extraTokens1 + fee, extraTokens2, 'extraTokens should be increased by fee')

    const owlBalance2 = (await owl.balanceOf(seller1)).toNumber()
    log(`\tburned OWL == ${amountOfOWLBurned}`)

    assert.strictEqual(owlBalance2, owlBalance1 - amountOfOWLBurned, 'some OWL should have been burned')
    assert.isAbove(owlBalance2, 0, 'some OWL should remain as it was > feeInUSD/2 and not all used up')
  })

  it('amountAfterFee == amount - fee(adjusted) when fee > 0 and account\'s OWL < feeInUSD / 2 and OWL balance < approved Tokens', async () => {
    const feeRatio = await makeFeeRatioPercent(0.5, seller1)

    const amount = 1000
    let fee = calculateFee(amount, feeRatio)
    const feeInUSD = await calculateFeeInUSD(fee, eth.address)

    const owlAmount = Math.floor(feeInUSD / 2) - 1

    const owlBalanceBefore = (await owl.balanceOf(seller1)).toNumber()
    await owl.transfer(seller1, owlAmount-owlBalanceBefore, { from: master })
    const owlBalance1 = (await owl.balanceOf(seller1)).toNumber()
    assert.strictEqual(owlBalance1, owlAmount, 'account should have OWL balance < feeInUSD / 2')
    assert.isAbove(owlBalance1, 0, 'account should have OWL balance > 0')

    await owl.approve(dx.address, owlAmount*1000, { from: seller1 })
    const amountOfOWLBurned = owlBalance1

    fee = adjustFee(fee, amountOfOWLBurned, feeInUSD)
    assert.isAbove(fee, 0, 'fee must be > 0')

    const auctionIndex = 1

    const extraTokens1 = await getExtraTokens2(eth.address, gno.address, auctionIndex)

    const amountAfterFee = await settleFee
      .call(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })

    assert.strictEqual(amountAfterFee, amount - fee, 'amount should be decreased by fee')
    
    await settleFee(eth.address, gno.address, auctionIndex, seller1, amount, { from: seller1 })
    const extraTokens2 = await getExtraTokens2(eth.address, gno.address, auctionIndex)
    assert.isTrue(extraTokens1.add(fee).eq(extraTokens2), 'extraTokens should be increased by fee')

    const owlBalance2 = (await owl.balanceOf(seller1)).toNumber()
    log(`\tburned OWL == ${amountOfOWLBurned}`)

    assert.strictEqual(owlBalance2, owlBalance1 - amountOfOWLBurned, 'some OWL should have been burned')
    assert.strictEqual(owlBalance2, 0, 'all OWL should be burned as it was < feeInUSD/2 and all used up')
  })
})


enableContractFlag(c1, c2)
