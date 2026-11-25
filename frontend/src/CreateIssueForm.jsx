import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseEventLogs } from "viem";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import { TARGET_CHAIN } from "./network";
import { PRIORITY, MAX_LOCATION, MAX_DESCRIPTION, byteLength } from "./constants";
import { friendlyError } from "./errors";

export default function CreateIssueForm({ onCreated }) {
  const { address: account, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });
  const { writeContractAsync } = useWriteContract();

  const [form, setForm] = useState({ location: "", description: "", priority: "1" });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);

    const location = form.location.trim();
    const description = form.description.trim();
    if (!location || !description) {
      return setError("La localisation et la description sont obligatoires.");
    }
    if (byteLength(location) > MAX_LOCATION) {
      return setError(`Localisation trop longue (maximum ${MAX_LOCATION} octets).`);
    }
    if (byteLength(description) > MAX_DESCRIPTION) {
      return setError(`Description trop longue (maximum ${MAX_DESCRIPTION} octets).`);
    }

    const request = {
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "createIssue",
      args: [location, description, Number(form.priority)],
    };

    setBusy(true);
    try {
      setStatus("Vérification...");
      await publicClient.simulateContract({ ...request, account });

      setStatus("Signature dans MetaMask...");
      const hash = await writeContractAsync({ ...request, chainId: TARGET_CHAIN.id });

      setStatus("Confirmation en cours...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        return setError("Transaction refusée par le contrat. Hash : " + hash);
      }

      const [event] = parseEventLogs({
        abi: CONTRACT_ABI,
        logs: receipt.logs,
        eventName: "IssueCreated",
      });
      setResult({ id: event?.args.id.toString(), hash });
      setForm({ location: "", description: "", priority: "1" });
      onCreated?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  if (!isConnected) {
    return (
      <div>
        <h2>Signaler un problème</h2>
        <p>Connecte ton wallet pour déclarer un problème.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
      <h2>Signaler un problème</h2>
      <input
        name="location"
        placeholder="Localisation (ex: Rue Hassan II, Casablanca)"
        value={form.location}
        onChange={update}
      />
      <textarea
        name="description"
        rows={3}
        placeholder="Description du problème"
        value={form.description}
        onChange={update}
      />
      <label>
        Priorité :{" "}
        <select name="priority" value={form.priority} onChange={update}>
          {PRIORITY.map((label, i) => (
            <option key={i} value={i}>{label}</option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={busy}>
        {busy ? status || "En cours..." : "Envoyer le signalement"}
      </button>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {result && (
        <div style={{ border: "1px solid #16a34a", padding: 10, wordBreak: "break-all" }}>
          <strong style={{ color: "#16a34a" }}>Signalement enregistré !</strong>
          <div>Identifiant : <code>{result.id}</code></div>
          <div>Hash : <code>{result.hash}</code></div>
        </div>
      )}
    </form>
  );
}