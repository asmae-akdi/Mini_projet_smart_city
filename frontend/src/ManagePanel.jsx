import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import { TARGET_CHAIN } from "./network";
import { STATUS, MAX_TEAM, MAX_COMMENT, byteLength } from "./constants";
import { friendlyError } from "./errors";

export default function ManagePanel({ issue, onUpdated }) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });
  const { writeContractAsync } = useWriteContract();

  const [team, setTeam] = useState(issue.assignedTeam || "");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: false });

  // On ne réinitialise que lorsqu'on change de signalement
  useEffect(() => {
    setTeam(issue.assignedTeam || "");
    setComment("");
    setMsg({ text: "", ok: false });
  }, [issue.id]);

  const status = issue.status;       // nombre : 0 = Signalé ... 4 = Clôturé
  const canAssign = status <= 2;     // affecter ou réaffecter
  const canAdvance = status >= 1 && status <= 3;
  const next = status + 1;

  const send = async (functionName, args, okText) => {
    setMsg({ text: "", ok: false });
    const request = { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName, args };

    setBusy(true);
    try {
      // Simulation : erreur claire avant MetaMask
      await publicClient.simulateContract({ ...request, account });
      const hash = await writeContractAsync({ ...request, chainId: TARGET_CHAIN.id });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        return setMsg({ text: "Transaction refusée par le contrat.", ok: false });
      }
      setMsg({ text: `${okText} Hash : ${hash}`, ok: true });
      setComment("");
      onUpdated?.();
    } catch (err) {
      setMsg({ text: friendlyError(err), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const checkComment = () => {
    if (byteLength(comment.trim()) > MAX_COMMENT) {
      setMsg({ text: `Commentaire trop long (maximum ${MAX_COMMENT} octets).`, ok: false });
      return false;
    }
    return true;
  };

  const handleAssign = (e) => {
    e.preventDefault();
    const t = team.trim();
    if (!t) return setMsg({ text: "Indique le nom de l'équipe.", ok: false });
    if (byteLength(t) > MAX_TEAM) {
      return setMsg({ text: `Nom d'équipe trop long (maximum ${MAX_TEAM} octets).`, ok: false });
    }
    if (!checkComment()) return;
    send("assignTeam", [issue.id, t, comment.trim()], "Équipe affectée.");
  };

  const handleAdvance = () => {
    if (!checkComment()) return;
    send("updateStatus", [issue.id, next, comment.trim()], `Statut mis à jour : ${STATUS[next]}.`);
  };

  if (status === 4) {
    return <p><em>Signalement clôturé : aucune action possible.</em></p>;
  }

  return (
    <div style={{ border: "1px solid #2563eb", padding: 12, margin: "12px 0", display: "grid", gap: 8, maxWidth: 520 }}>
      <strong>Gestion municipale</strong>
      {canAssign && (
        <input
          placeholder="Équipe d'intervention (ex: Equipe Eclairage)"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        />
      )}
      <input
        placeholder="Commentaire sur l'intervention (facultatif)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canAssign && (
          <button onClick={handleAssign} disabled={busy}>
            {status === 0 ? "Affecter l'équipe" : "Réaffecter l'équipe"}
          </button>
        )}
        {canAdvance && (
          <button onClick={handleAdvance} disabled={busy}>
            Passer à « {STATUS[next]} »
          </button>
        )}
      </div>
      {status === 0 && <small>Affecte d'abord une équipe avant de faire avancer le statut.</small>}
      {busy && <small>Transaction en cours...</small>}

      {msg.text && (
        <p style={{ margin: 0, color: msg.ok ? "#16a34a" : "crimson", wordBreak: "break-all" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}