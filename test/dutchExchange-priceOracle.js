/*
  eslint prefer-const: 0,
  max-len: 0,
  object-curly-newline: 1,
  no-param-reassign: 0,
  no-console: 0,
  no-mixed-operators: 0,
  no-floating-decimal: 0,
  no-trailing-spaces: 0,
  no-multi-spaces: 0,
*/

const {
  assertRejects, 
  gasLogger,
  enableContractFlag,
} = require('./utils')

const {
  getContracts,
  setupTest,
} = require('./testFunctions')

const Medianizer = artifacts.require('Medianizer')
const PriceFeed = artifacts.require('PriceFeed')

// Test VARS
let oracle
let priceFeed

let medzr2
let contracts

const setupContracts = async () => {
  contracts = await getContracts();
  // destructure contracts into upper state
  ({
    PriceOracleInterface: oracle,
    PriceFeed: priceFeed,
  } = contracts)
}

const c1 = () => contract('DX PriceOracleInterface Flow', (accounts) => {
  const [owner, notOwner, newCurator] = accounts
  
  const startBal = {
    startingETH: 1000..toWei(),
    startingGNO: 1000..toWei(),
    ethUSDPrice: 6000..toWei(),   // 400 ETH @ $6000/ETH = $2,400,000 USD
    sellingAmount: 100..toWei(), // Same as web3.toWei(50, 'ether') - $60,000USD
  }
  
  afterEach(gasLogger)
  
  it('SETUP: fund accounts, fund DX', async () => {
    // get contracts
    await setupContracts()
    contracts.medzr2 = await Medianizer.new()
    contracts.priceFeed2 = await PriceFeed.new();
    ({ medzr2 } = contracts)

    // set up accounts and tokens[contracts]
    await setupTest(accounts, contracts, startBal)
  })

  it(
    'updatePriceFeedSource: throws when NON-OWNER tries to change source',
    async () => assertRejects(oracle.updatePriceFeedSource(medzr2, { from: notOwner })),
  )

  it('updatePriceFeedSource: switches PFS to new PFS', async () => {
    const oldPFS = await oracle.priceFeedSource.call()
    await oracle.updatePriceFeedSource(medzr2.address, { from: owner })
    const newPFS = await oracle.priceFeedSource.call()

    // set the new priceFeed into Medianizer2
    await medzr2.set(priceFeed.address, { from: owner }) 

    assert.notEqual(oldPFS, newPFS, 'Old FPS should NOT == New FPS')
    assert.equal(newPFS, medzr2.address, 'new PFS = medzr2')
  })

  it(
    'updateCurator: throws when NON-OWNER tries to change curator',
    async () => assertRejects(oracle.updateCurator(medzr2, { from: notOwner })),
  )

  it('updateCurator: switches OWNER to new OWNER', async () => {
    const oldOwner = await oracle.owner.call()
    await oracle.updateCurator(newCurator, { from: owner })
    const newOwner = await oracle.owner.call()

    assert.notEqual(oldOwner, newOwner, 'Old Owner should NOT == New Owner')
    assert.equal(newCurator, newOwner, 'New Curator passed in is indeed newOwner')
  })

  it('getUSDETHPrice: calls this correctly', async () => {
    const ethUSDPrice = (await oracle.getUSDETHPrice.call()).toNumber()
    assert.equal(ethUSDPrice, 0, 'Oracle ethUSDPrice not set yet so should = 0')
  })

  it('getUSDETHPrice: set price', async () => {    
    const ethUSDPrice = 1500..toWei()

    await priceFeed.post(ethUSDPrice, 1516168838 * 2, medzr2.address, { from: owner })
    const getNewETHUSDPrice = (await oracle.getUSDETHPrice.call()).toNumber()

    assert.equal(ethUSDPrice.toEth(), getNewETHUSDPrice, 'Should be same')
  })
})

enableContractFlag(c1)
