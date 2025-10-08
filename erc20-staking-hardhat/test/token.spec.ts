import { expect } from "chai";
import { ethers } from "hardhat";

describe("Token (NOVM)", () => {
  it("deploys with correct metadata", async () => {
    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy("Novum", "NOVM", 0n);
    await token.waitForDeployment();

    expect(await token.name()).to.eq("Novum");
    expect(await token.symbol()).to.eq("NOVM");
  });
});
