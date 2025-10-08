import { useEffect, useState } from "react";
import { connectWallet, getTokenContract, getStakingContract } from "./lib/ethers";

const cfg = {
  network: import.meta.env.VITE_NETWORK,
  token: import.meta.env.VITE_TOKEN_ADDRESS as string,
  staking: import.meta.env.VITE_STAKING_ADDRESS as string,
};

type Conn = {
  account?: string;
  chainId?: string;
  tokenName?: string;
  tokenSymbol?: string;
  paused?: boolean;
  totalStaked?: string;
};

export default function App() {
  const [conn, setConn] = useState<Conn>({});
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    try {
      setBusy(true);
      const { provider, signer, address } = await connectWallet();
      const net = await provider.getNetwork();

      if (!cfg.token) throw new Error("VITE_TOKEN_ADDRESS is empty");
      const token = getTokenContract(signer, cfg.token);
      const name = await token.name();
      const symbol = await token.symbol();
      const paused = await token.paused?.().catch(() => false);

      let totalStakedDisplay = "-";
      if (cfg.staking) {
        const staking = getStakingContract(signer, cfg.staking);
        const totalStaked = await staking.totalStaked?.().catch(() => null);
        if (totalStaked) {
          // NOTE: Token has 18 decimals; this is a quick division for display only.
          totalStakedDisplay = (Number(totalStaked) / 1e18).toString();
        }
      }

      setConn({
        account: address,
        chainId: net.chainId.toString(),
        tokenName: name,
        tokenSymbol: symbol,
        paused: !!paused,
        totalStaked: totalStakedDisplay,
      });
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1>Novum Admin</h1>
      <p style={{ opacity: 0.8 }}>Lightweight admin dashboard (ethers v6)</p>

      <div style={{ margin: "16px 0" }}>
        <button onClick={onConnect} disabled={busy} style={{ padding: "8px 16px" }}>
          {busy ? "Connecting..." : "Connect Wallet"}
        </button>
      </div>

      {conn.account && (
        <div style={{ marginTop: 16, lineHeight: 1.6 }}>
          <div><b>Account:</b> {conn.account}</div>
          <div><b>ChainId:</b> {conn.chainId}</div>
          <div><b>Token:</b> {conn.tokenName} ({conn.tokenSymbol})</div>
          <div><b>Paused:</b> {String(conn.paused)}</div>
          <div><b>Total Staked:</b> {conn.totalStaked}</div>
        </div>
      )}

      <hr style={{ margin: "24px 0" }} />

      <p style={{ opacity: 0.7 }}>
        Configure addresses via <code>.env.local</code>: <code>VITE_TOKEN_ADDRESS</code>, <code>VITE_STAKING_ADDRESS</code>
      </p>
    </div>
  );
}
