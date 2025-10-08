/**
 * @file 00_deploy.ts
 * @notice Deploy Token and Staking skeleton. Post-deploy wiring will come later.
 */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  // Deploy Token with optional cap (e.g., 100_000_000 * 1e18)
  const name = "Novum";
  const symbol = "NOVM";
  const cap = ethers.parseUnits("100000000", 18); // set to 0n if uncapped

  const Token = await ethers.getContractFactory("Token");
  const token = await Token.deploy(name, symbol, cap);
  await token.waitForDeployment();

  const Staking = await ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(await token.getAddress());
  await staking.waitForDeployment();

  console.log("Deployed by:", await deployer.getAddress());
  console.log("Token:", await token.getAddress());
  console.log("Staking:", await staking.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
