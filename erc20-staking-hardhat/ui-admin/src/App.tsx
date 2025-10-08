import { useEffect, useState } from "react";
import { connectWallet, getTokenContract, getStakingContract } from "./lib/ethers";
import { setApr, fundRewards } from "./lib/ethers";

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
  const [aprBps, setAprBps] = useState("1200");
  const [fundAmt, setFundAmt] = useState("500");

  // Keep signer/instances for after connect
  const [signer, setSigner] = useState<any>(null);

  async function onConnect() {
    try {
      setBusy(true);
      const { provider, signer, address } = await connectWallet();
      setSigner(signer);
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
        if (totalStaked) totalStakedDisplay = (Number(totalStaked) / 1e18).toString();
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

  async function onSetApr() {
    if (!signer) return alert("Connect wallet first.");
    if (!cfg.staking) return alert("Missing VITE_STAKING_ADDRESS");
    try {
      setBusy(true);
      await setApr(signer, cfg.staking, Number(aprBps));
      alert("APR updated!");
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFund() {
    if (!signer) return alert("Connect wallet first.");
    if (!cfg.staking || !cfg.token) return alert("Missing addresses in .env.local");
    try {
      setBusy(true);
      await fundRewards(signer, cfg.staking, cfg.token, fundAmt);
      alert("Rewards funded!");
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
          <div><b>Total Staked:</b> {conn.totalStaked}</div>
        </div>
      )}

      <hr style={{ margin: "24px 0" }} />

      {/* --- Admin: Set APR --- */}
      <div style={{ marginBottom: 16 }}>
        <h3>Set APR (bps)</h3>
        <input
          type="number"
          value={aprBps}
          onChange={(e) => setAprBps(e.target.value)}
          placeholder="e.g., 1200"
          style={{ padding: 8, width: 200, marginRight: 8 }}
        />
        <button onClick={onSetApr} disabled={busy}>Update APR</button>
      </div>

      {/* --- Admin: Fund Rewards --- */}
      <div style={{ marginBottom: 16 }}>
        <h3>Fund Rewards (tokens)</h3>
        <input
          value={fundAmt}
          onChange={(e) => setFundAmt(e.target.value)}
          placeholder="e.g., 500"
          style={{ padding: 8, width: 200, marginRight: 8 }}
        />
        <button onClick={onFund} disabled={busy}>Fund</button>
      </div>

      <hr style={{ margin: "24px 0" }} />
      <p style={{ opacity: 0.7 }}>
        Configure addresses via <code>.env.local</code>: <code>VITE_TOKEN_ADDRESS</code>, <code>VITE_STAKING_ADDRESS</code>
      </p>
    </div>
  );
}
