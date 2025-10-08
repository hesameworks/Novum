/**
 * @file grant-roles.ts
 * @notice Grant MINTER/PAUSER to desired addresses. Run after deploy.
 */
import { ethers } from "hardhat";

async function main() {
  const tokenAddr = process.argv[2];
  if (!tokenAddr) throw new Error("Usage: ts-node scripts/grant-roles.ts <tokenAddress> <minter> <pauser>");

  const minter = process.argv[3];
  const pauser = process.argv[4];

  const token = await ethers.getContractAt("Token", tokenAddr);
  const MINTER_ROLE = await token.MINTER_ROLE();
  const PAUSER_ROLE = await token.PAUSER_ROLE();

  if (minter) await (await token.grantRole(MINTER_ROLE, minter)).wait();
  if (pauser) await (await token.grantRole(PAUSER_ROLE, pauser)).wait();

  console.log("Roles granted.");
}
main().catch(e => { console.error(e); process.exit(1); });
