import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import { TARGET_CHAIN } from "./network";
import {
  STATUS, STATUS_COLORS, PRIORITY, PRIORITY_COLORS, shortAddress, formatDate,
} from "./constants";
import { friendlyError } from "./errors";

const PAGE_SIZE = 10;

export function Badge({ text, color }) {
  return (
    <span style={{ background: color, color: "white", padding: "2px 8px", borderRadius: 10, fontSize: 12, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

export default function IssueList({ refreshKey, onSelect }) {
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const count = Number(
          await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: "totalIssues",
          })
        );
        if (cancelled) return;
        setTotal(count);

        // Page 0 = les plus récents. Les indices vont de 0 à count - 1.
        const end = count - page * PAGE_SIZE;
        if (end <= 0) {
          setIssues([]);
          return;
        }
        const start = Math.max(0, end - PAGE_SIZE);
        const data = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "getIssues",
          args: [BigInt(start), BigInt(end - start)],
        });
        if (!cancelled) setIssues([...data].reverse());
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [page, refreshKey]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const th = { border: "1px solid #d1d5db", padding: 6, textAlign: "left", background: "#f3f4f6" };
  const td = { border: "1px solid #d1d5db", padding: 6, verticalAlign: "top" };

  return (
    <div>
      <h2>Signalements ({total})</h2>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loading && <p>Chargement...</p>}
      {!loading && total === 0 && !error && <p>Aucun signalement pour le moment.</p>}

      {issues.length > 0 && (
        <table style={{ borderCollapse: "collapse", fontSize: 14, width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>N°</th>
              <th style={th}>Localisation</th>
              <th style={th}>Description</th>
              <th style={th}>Priorité</th>
              <th style={th}>Statut</th>
              <th style={th}>Équipe</th>
              <th style={th}>Créé le</th>
              <th style={th}>Auteur</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr
                key={i.id.toString()}
                onClick={() => onSelect?.(i)}
                style={{ cursor: onSelect ? "pointer" : "default" }}
              >
                <td style={td}>{i.id.toString()}</td>
                <td style={td}>{i.location}</td>
                <td style={td}>{i.description}</td>
                <td style={td}><Badge text={PRIORITY[i.priority]} color={PRIORITY_COLORS[i.priority]} /></td>
                <td style={td}><Badge text={STATUS[i.status]} color={STATUS_COLORS[i.status]} /></td>
                <td style={td}>{i.assignedTeam || "-"}</td>
                <td style={td}>{formatDate(i.createdAt)}</td>
                <td style={td}><code>{shortAddress(i.reporter)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {total > PAGE_SIZE && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setPage(page - 1)} disabled={page === 0}>Précédent</button>
          <span>Page {page + 1} / {pages}</span>
          <button onClick={() => setPage(page + 1)} disabled={page + 1 >= pages}>Suivant</button>
        </div>
      )}
    </div>
  );
}