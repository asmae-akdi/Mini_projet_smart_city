import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import { TARGET_CHAIN } from "./network";
import {
  STATUS, STATUS_COLORS, PRIORITY, PRIORITY_COLORS, shortAddress, formatDate,
} from "./constants";
import { friendlyError } from "./errors";
import { Badge } from "./IssueList";
import ManagePanel from "./ManagePanel";

export default function IssueDetail({ issueId, canManage, refreshKey, onChanged }) {
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });
  const { address: account } = useAccount();
  const [issue, setIssue] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      try {
        const read = (functionName) =>
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName,
            args: [issueId],
          });
        const [i, h] = await Promise.all([read("getIssue"), read("getHistory")]);
        if (!cancelled) {
          setIssue(i);
          setHistory([...h]);
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [issueId, version, refreshKey]);

  // Fait défiler la page jusqu'à la fiche quand on change de signalement
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [issueId]);

  const handleUpdated = () => {
    setVersion((v) => v + 1);
    onChanged?.();
  };

  const row = { display: "flex", gap: 8, padding: "3px 0", wordBreak: "break-all" };
  const label = { width: 130, fontWeight: "bold", flexShrink: 0 };

  return (
    <div ref={ref} style={{ border: "1px solid #d1d5db", padding: 16, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>Signalement n° {issueId.toString()}</h2>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {issue && (
        <>
          <div style={row}><span style={label}>Localisation</span>{issue.location}</div>
          <div style={row}><span style={label}>Description</span>{issue.description}</div>
          <div style={row}>
            <span style={label}>Priorité</span>
            <Badge text={PRIORITY[issue.priority]} color={PRIORITY_COLORS[issue.priority]} />
          </div>
          <div style={row}>
            <span style={label}>Statut</span>
            <Badge text={STATUS[issue.status]} color={STATUS_COLORS[issue.status]} />
          </div>
          <div style={row}><span style={label}>Équipe</span>{issue.assignedTeam || "-"}</div>
          <div style={row}><span style={label}>Créé le</span>{formatDate(issue.createdAt)}</div>
          <div style={row}><span style={label}>Mis à jour le</span>{formatDate(issue.updatedAt)}</div>
          <div style={row}><span style={label}>Déclaré par</span><code>{issue.reporter}</code></div>

          {canManage && <ManagePanel issue={issue} onUpdated={handleUpdated} />}

          <h3>Historique ({history.length})</h3>
          <ol style={{ paddingLeft: 20 }}>
            {history.map((h, idx) => (
              <li key={idx} style={{ marginBottom: 10 }}>
                <div>
                  <strong>{formatDate(h.timestamp)}</strong>{" "}
                  <Badge text={STATUS[h.status]} color={STATUS_COLORS[h.status]} />
                </div>
                {h.team && <div>Équipe : {h.team}</div>}
                {h.comment && <div>Commentaire : {h.comment}</div>}
                <div>
                  Par : <code>{shortAddress(h.actor)}</code>
                  {account && h.actor.toLowerCase() === account.toLowerCase() && " (vous)"}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}