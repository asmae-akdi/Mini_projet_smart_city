import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import { TARGET_CHAIN } from "./network";
import {
  STATUS, STATUS_COLORS, PRIORITY, PRIORITY_COLORS, shortAddress, formatDate,
} from "./constants";
import { friendlyError } from "./errors";
import { Badge } from "./IssueList";

const PAGE_SIZE = 10;
const CHUNK = 50;

function exportCsv(list) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["id", "localisation", "description", "priorite", "statut", "equipe", "declare_par", "cree_le"];
  const lines = list.map((i) =>
    [
      i.id.toString(), i.location, i.description, PRIORITY[i.priority], STATUS[i.status],
      i.assignedTeam, i.reporter, formatDate(i.createdAt),
    ].map(esc).join(",")
  );
  const csv = "\uFEFF" + [header.join(","), ...lines].join("\n"); // BOM : accents corrects dans Excel
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "signalements.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function PublicExplorer({ refreshKey, onSelect }) {
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const count = Number(
          await publicClient.readContract({
            address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "totalIssues",
          })
        );
        const result = [];
        for (let start = 0; start < count; start += CHUNK) {
          const data = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: "getIssues",
            args: [BigInt(start), BigInt(Math.min(CHUNK, count - start))],
          });
          result.push(...data);
        }
        if (!cancelled) setAll(result.reverse()); // les plus récents d'abord
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Statistiques calculées sur TOUS les signalements
  const stats = useMemo(() => {
    const byStatus = STATUS.map(() => 0);
    const byPriority = PRIORITY.map(() => 0);
    all.forEach((i) => { byStatus[i.status]++; byPriority[i.priority]++; });
    return { byStatus, byPriority };
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((i) => {
      if (statusFilter !== "all" && i.status !== Number(statusFilter)) return false;
      if (priorityFilter !== "all" && i.priority !== Number(priorityFilter)) return false;
      if (q && !`${i.location} ${i.description} ${i.assignedTeam}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, statusFilter, priorityFilter, search]);

  // Revient à la page 1 quand un filtre change
  useEffect(() => { setPage(0); }, [statusFilter, priorityFilter, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const th = { border: "1px solid #d1d5db", padding: 6, textAlign: "left", background: "#f3f4f6" };
  const td = { border: "1px solid #d1d5db", padding: 6, verticalAlign: "top" };
  const card = { border: "1px solid #d1d5db", padding: "8px 14px", minWidth: 90, textAlign: "center" };

  return (
    <div>
      <h2>Signalements ({all.length})</h2>

      {/* Statistiques */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {STATUS.map((s, k) => (
          <div key={s} style={{ ...card, borderTop: `4px solid ${STATUS_COLORS[k]}` }}>
            <div style={{ fontSize: 22, fontWeight: "bold" }}>{stats.byStatus[k]}</div>
            <small>{s}</small>
          </div>
        ))}
        <div style={{ width: 16 }} />
        {PRIORITY.map((p, k) => (
          <div key={p} style={{ ...card, borderTop: `4px solid ${PRIORITY_COLORS[k]}` }}>
            <div style={{ fontSize: 22, fontWeight: "bold" }}>{stats.byPriority[k]}</div>
            <small>{p}</small>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          placeholder="Rechercher (lieu, description, équipe)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tous les statuts</option>
          {STATUS.map((s, k) => <option key={s} value={k}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">Toutes les priorités</option>
          {PRIORITY.map((p, k) => <option key={p} value={k}>{p}</option>)}
        </select>
        <button onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
          Exporter en CSV ({filtered.length})
        </button>
      </div>

      {loading && <p>Chargement...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p>{all.length === 0 ? "Aucun signalement pour le moment." : "Aucun résultat pour ces filtres."}</p>
      )}

      {visible.length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>N°</th><th style={th}>Localisation</th><th style={th}>Description</th>
              <th style={th}>Priorité</th><th style={th}>Statut</th><th style={th}>Équipe</th>
              <th style={th}>Déclaré par</th><th style={th}>Date</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id.toString()} onClick={() => onSelect(i)} style={{ cursor: "pointer" }}>
                <td style={td}>{i.id.toString()}</td>
                <td style={td}>{i.location}</td>
                <td style={td}>{i.description}</td>
                <td style={td}><Badge text={PRIORITY[i.priority]} color={PRIORITY_COLORS[i.priority]} /></td>
                <td style={td}><Badge text={STATUS[i.status]} color={STATUS_COLORS[i.status]} /></td>
                <td style={td}>{i.assignedTeam || "-"}</td>
                <td style={td}><code>{shortAddress(i.reporter)}</code></td>
                <td style={td}>{formatDate(i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
        <span>Page {page + 1} / {pages}</span>
        <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Suivant</button>
      </div>
    </div>
  );
}