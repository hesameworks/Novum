import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

const YEAR = 365 * 24 * 60 * 60; // seconds
const toWei = (n: string) => ethers.parseUnits(n, 18);
const fromWei = (x: bigint) => Number(ethers.formatUnits(x, 18));

async function increase(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

async function expectClose(
  actual: bigint,
  expected: bigint,
  tolerancePpm = 5_000 // 0.5% tolerance
) {
  const a = Number(actual);
  const e = Number(expected);
  const diff = Math.abs(a - e);
  const maxDiff = (e * tolerancePpm) / 1_000_000;
  expect(diff, `diff=${diff} expected=${e}`).to.be.lessThanOrEqual(maxDiff);
}

describe("Staking", () => {
  let deployer: Signer, alice: Signer, bob: Signer;
  let token: Contract, staking: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    // Deploy Token (uncapped for tests)
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Novum", "NOVM", 0n);
    await token.waitForDeployment();

    // Deploy Staking
    const Staking = await ethers.getContractFactory("Staking");
    staking = await Staking.deploy(await token.getAddress());
    await staking.waitForDeployment();

    // --- Grant roles for test control ---
    // Token: allow deployer to mint
    await (await token.grantRole(await token.MINTER_ROLE(), await deployer.getAddress())).wait();

    // Staking: allow deployer to pause and manage rewards
    await (await staking.grantRole(await staking.PAUSER_ROLE(), await deployer.getAddress())).wait();
    await (await staking.grantRole(await staking.REWARD_ADMIN_ROLE(), await deployer.getAddress())).wait();

    // --- Mint balances & approvals ---
    // Alice & Bob get balances
    await (await token.mint(await alice.getAddress(), toWei("1000"))).wait();
    await (await token.mint(await bob.getAddress(), toWei("1000"))).wait();

    // Deployer will fund the reward pool as needed
    await (await token.mint(await deployer.getAddress(), toWei("10000"))).wait();

    // Approvals
    const INF = ethers.MaxUint256; // bigint
    await (await token.connect(alice).approve(await staking.getAddress(), INF)).wait();
    await (await token.connect(bob).approve(await staking.getAddress(), INF)).wait();
    await (await token.connect(deployer).approve(await staking.getAddress(), INF)).wait();
  });

  it("single staker accrues ~APR rewards over time", async () => {
    // Configure APR = 12%
    await (await staking.setAPR(1200)).wait();

    // Fund reward pool generously
    await (await staking.fundRewards(toWei("1000"))).wait();

    // Alice stakes 100 tokens
    await (await staking.connect(alice).stake(toWei("100"))).wait();

    // Advance ~30 days
    const days = 30;
    await increase(days * 24 * 60 * 60);

    // Claim
    const before = await token.balanceOf(await alice.getAddress());
    await (await staking.connect(alice).getReward()).wait();
    const after = await token.balanceOf(await alice.getAddress());
    const paid = after - before;

    // expected reward ≈ principal * APR * (t/YEAR)
    // 100 * 0.12 * (30/365) ≈ 3.287671
    const expected = toWei((100 * 0.12 * (days / 365)).toString());
    await expectClose(paid, expected, 7_000); // 0.7% tolerance
  });

  it("stake/withdraw updates totalStaked and rewardRate", async () => {
    await (await staking.setAPR(1000)).wait(); // 10% APR
    await (await staking.fundRewards(toWei("1000"))).wait();

    // Alice stakes 50
    await (await staking.connect(alice).stake(toWei("50"))).wait();
    const r1 = await staking.rewardRate();

    // Bob stakes 50 (total 100) => rewardRate should roughly double
    await (await staking.connect(bob).stake(toWei("50"))).wait();
    const r2 = await staking.rewardRate();
    expect(Number(r2)).to.be.greaterThan(Number(r1));

    // Bob withdraws 50 => rewardRate should reduce back
    await (await staking.connect(bob).withdraw(toWei("50"))).wait();
    const r3 = await staking.rewardRate();
    await expectClose(r3, r1, 10_000); // ~1% tolerance
  });

  it("insufficient reward pool reverts getReward", async () => {
    await (await staking.setAPR(5000)).wait(); // 50% APR
    await (await staking.fundRewards(toWei("0.1"))).wait(); // very small pool
    await (await staking.connect(alice).stake(toWei("100"))).wait();

    // Let some rewards accrue
    await increase(60 * 60 * 24 * 10); // ~10 days

    // Attempting to claim should fail if pool < reward
    await expect(staking.connect(alice).getReward()).to.be.revertedWith("insufficient reward pool");
  });

  it("pause blocks stake/withdraw/getReward and unpause restores", async () => {
    await (await staking.setAPR(1000)).wait();
    await (await staking.fundRewards(toWei("100"))).wait();

    await (await staking.pause()).wait();
    await expect(staking.connect(alice).stake(toWei("1"))).to.be.revertedWithCustomError(staking, "EnforcedPause");
    await expect(staking.connect(alice).withdraw(toWei("1"))).to.be.revertedWithCustomError(staking, "EnforcedPause");
    await expect(staking.connect(alice).getReward()).to.be.revertedWithCustomError(staking, "EnforcedPause");

    await (await staking.unpause()).wait();
    await (await staking.connect(alice).stake(toWei("1"))).wait();
  });

  it("exit withdraws all and pays rewards", async () => {
    await (await staking.setAPR(1200)).wait();     // 12%
    await (await staking.fundRewards(toWei("1000"))).wait();
    await (await staking.connect(alice).stake(toWei("10"))).wait();

    await increase(15 * 24 * 60 * 60); // ~15 days

    const balBefore = await token.balanceOf(await alice.getAddress());
    const stakedBefore = await staking.balances(await alice.getAddress());
    expect(stakedBefore).to.eq(toWei("10"));

    await (await staking.connect(alice).exit()).wait();

    const balAfter = await token.balanceOf(await alice.getAddress());
    const stakedAfter = await staking.balances(await alice.getAddress());
    expect(stakedAfter).to.eq(0);

    // Should have at least principal back + some reward (> 10)
    expect(fromWei(balAfter - balBefore)).to.be.greaterThan(10);
  });
});
