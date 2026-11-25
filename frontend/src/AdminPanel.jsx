import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { isAddress } from "viem";
import { CONTRACT_ADDRESS, CONTRACT_ABI, MUNICIPAL_ROLE } from "./contract";
import { TARGET_CHAIN } from "./network";
import { friendlyError } from "./errors";

export default function AdminPanel() {
  const { address: account } = useAccount();
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });
  const { writeContractAsync } = useWriteContract();
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: false });

  const run = async (functionName, okText) => {
    setMsg({ text: "", ok: false });
    const value = agent.trim();
    if (!isAddress(value)) {
      return setMsg({ text: "Adresse invalide.", ok: false });
    }
    const request = {
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName,
      args: [MUNICIPAL_ROLE, value],
    };
    setBusy(true);
    try {
      await publicClient.simulateContract({ ...request, account });
      const hash = await writeContractAsync({ ...request, chainId: TARGET_CHAIN.id });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setMsg(
        receipt.status === "success"
          ? { text: `${okText} Hash : ${hash}`, ok: true }
          : { text: "Transaction refusée par le contrat.", ok: false }
      );
    } catch (err) {
      setMsg({ text: friendlyError(err), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1px solid #d97706", padding: 12, marginBottom: 20, maxWidth: 560 }}>
      <strong>Administration : agents municipaux</strong>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input
          style={{ flex: 1, minWidth: 260 }}
          placeholder="Adresse du compte (0x...)"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        />
        <button disabled={busy} onClick={() => run("grantRole", "Rôle municipal attribué.")}>
          Ajouter
        </button>
        <button disabled={busy} onClick={() => run("revokeRole", "Rôle municipal retiré.")}>
          Retirer
        </button>
      </div>
      {msg.text && (
        <p style={{ color: msg.ok ? "#16a34a" : "crimson", wordBreak: "break-all" }}>{msg.text}</p>
      )}
    </div>
  );
}