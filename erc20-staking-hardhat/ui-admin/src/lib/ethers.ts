// Minimal ethers v6 helpers for browser dapp
import { BrowserProvider, JsonRpcSigner, Contract } from "ethers";
import tokenAbi from "../abi/Token.json";
import stakingAbi from "../abi/Staking.json";

export async function getProvider(): Promise<BrowserProvider> {
  if (!(window as any).ethereum) {
    throw new Error("MetaMask not detected");
  }
  const provider = new BrowserProvider((window as any).ethereum);
  return provider;
}

export async function connectWallet(): Promise<{ provider: BrowserProvider; signer: JsonRpcSigner; address: string }> {
  const provider = await getProvider();
  await (window as any).ethereum.request({ method: "eth_requestAccounts" });
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

export function getTokenContract(signerOrProvider: any, tokenAddress: string) {
  return new Contract(tokenAddress, tokenAbi, signerOrProvider);
}

export function getStakingContract(signerOrProvider: any, stakingAddress: string) {
  return new Contract(stakingAddress, stakingAbi, signerOrProvider);
}
