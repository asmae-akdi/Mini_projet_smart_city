import { useState } from "react";
import * as XLSX from "xlsx";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./contract";
import { TARGET_CHAIN } from "./network";
import { PRIORITY, MAX_LOCATION, MAX_DESCRIPTION, byteLength } from "./constants";
import { friendlyError } from "./errors";

const LOT_SIZE = 10;

// Enlève accents et majuscules : "Priorité " -> "priorite"
const clean = (s) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const COLUMN_ALIASES = {
  location: ["location", "localisation", "lieu", "adresse"],
  description: ["description", "desc", "probleme", "details"],
  priority: ["priority", "priorite"],
};

const PRIORITY_ALIASES = {
  0: ["0", "low", "basse", "faible"],
  1: ["1", "medium", "moyenne", "moyen"],
  2: ["2", "high", "haute", "elevee"],
  3: ["3", "critical", "critique", "urgent"],
};

function parsePriority(value) {
  const v = clean(value);
  for (const [num, names] of Object.entries(PRIORITY_ALIASES)) {
    if (names.includes(v)) return Number(num);
  }
  return null;
}

// Trouve la valeur d'une colonne quel que soit son nom (location / Localisation...)
function pick(row, field) {
  for (const key of Object.keys(row)) {
    if (COLUMN_ALIASES[field].includes(clean(key))) return row[key];
  }
  return "";
}

function validate(raw, index) {
  const location = String(pick(raw, "location") ?? "").trim();
  const description = String(pick(raw, "description") ?? "").trim();
  const priority = parsePriority(pick(raw, "priority"));

  let error = "";
  if (!location) error = "Localisation vide";
  else if (byteLength(location) > MAX_LOCATION) error = "Localisation trop longue";
  else if (!description) error = "Description vide";
  else if (byteLength(description) > MAX_DESCRIPTION) error = "Description trop longue";
  else if (priority === null) error = "Priorité inconnue";

  return {
    line: index + 2, // ligne 1 = en-têtes
    location,
    description,
    priority,
    error,
    selected: !error,
    done: false,
  };
}

function downloadSample(format) {
  const data = [
    ["location", "description", "priority"],
    ["Avenue Hassan II", "Lampadaire éteint depuis 3 jours", "Haute"],
    ["Rue des Orangers", "Nid-de-poule dangereux", "Critique"],
    ["Place du Marché", "Poubelles débordantes", "Moyenne"],
    ["Boulevard Zerktouni", "Panneau de signalisation tordu", "Basse"],
    ["", "Ligne invalide : localisation vide", "Haute"],
    ["Rue Ibn Sina", "Ligne invalide : priorité inconnue", "Urgentissime"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Signalements");
  XLSX.writeFile(wb, `exemple_signalements.${format}`, { bookType: format });
}

export default function ImportPanel({ onImported }) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });
  const { writeContractAsync } = useWriteContract();

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg({ text: "", ok: false });
    setProgress("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (raw.length === 0) {
        setRows([]);
        return setMsg({ text: "Le fichier est vide.", ok: false });
      }
      setFileName(file.name);
      setRows(raw.map(validate));
    } catch {
      setRows([]);
      setMsg({ text: "Impossible de lire ce fichier (format non supporté).", ok: false });
    }
    e.target.value = ""; // permet de re-choisir le même fichier
  };

  const toggle = (i) =>
    setRows((rs) => rs.map((r, idx) => (idx === i && !r.error && !r.done ? { ...r, selected: !r.selected } : r)));

  const toggleAll = (checked) =>
    setRows((rs) => rs.map((r) => (r.error || r.done ? r : { ...r, selected: checked })));

  const toSend = rows.filter((r) => r.selected && !r.error && !r.done);
  const validCount = rows.filter((r) => !r.error).length;
  const invalidCount = rows.length - validCount;

  const handleImport = async () => {
    setMsg({ text: "", ok: false });
    const lots = [];
    for (let i = 0; i < toSend.length; i += LOT_SIZE) lots.push(toSend.slice(i, i + LOT_SIZE));

    setBusy(true);
    let saved = 0;
    try {
      for (let n = 0; n < lots.length; n++) {
        setProgress(`Lot ${n + 1} / ${lots.length} en cours...`);
        const lot = lots[n];
        const request = {
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "batchCreateIssues",
          args: [lot.map((r) => ({ location: r.location, description: r.description, priority: r.priority }))],
        };

        await publicClient.simulateContract({ ...request, account });
        const hash = await writeContractAsync({ ...request, chainId: TARGET_CHAIN.id });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction refusée par le contrat.");

        // Marque les lignes du lot comme enregistrées
        const lines = new Set(lot.map((r) => r.line));
        setRows((rs) => rs.map((r) => (lines.has(r.line) ? { ...r, done: true, selected: false } : r)));
        saved += lot.length;
        onImported?.();
      }
      setProgress("");
      setMsg({ text: `${saved} signalement(s) enregistré(s) sur la blockchain.`, ok: true });
    } catch (err) {
      setProgress("");
      const detail = err?.message === "Transaction refusée par le contrat." ? err.message : friendlyError(err);
      setMsg({
        text: `Import interrompu après ${saved} signalement(s) enregistré(s). ${detail}`,
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const cell = { padding: "4px 8px", borderBottom: "1px solid #e5e7eb", textAlign: "left" };

  return (
    <div style={{ border: "1px solid #16a34a", padding: 12, margin: "12px 0" }}>
      <strong>Import en masse (Excel / CSV)</strong>
      <p style={{ margin: "6px 0" }}>
        Colonnes attendues : <code>location</code>, <code>description</code>, <code>priority</code>{" "}
        (Basse / Moyenne / Haute / Critique). Les lignes sont enregistrées par lots de {LOT_SIZE}.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={busy} />
        <button onClick={() => downloadSample("xlsx")}>Exemple .xlsx</button>
        <button onClick={() => downloadSample("csv")}>Exemple .csv</button>
      </div>

      {rows.length > 0 && (
        <>
          <p>
            <strong>{fileName}</strong> : {rows.length} ligne(s), {validCount} valide(s),{" "}
            <span style={{ color: invalidCount ? "crimson" : "inherit" }}>{invalidCount} invalide(s)</span>
          </p>

          <div style={{ maxHeight: 320, overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={cell}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={toSend.length > 0 && toSend.length === rows.filter((r) => !r.error && !r.done).length}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th style={cell}>Ligne</th>
                  <th style={cell}>Localisation</th>
                  <th style={cell}>Description</th>
                  <th style={cell}>Priorité</th>
                  <th style={cell}>État</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: r.error ? "#fef2f2" : r.done ? "#f0fdf4" : "transparent" }}>
                    <td style={cell}>
                      <input
                        type="checkbox"
                        checked={r.selected}
                        disabled={!!r.error || r.done || busy}
                        onChange={() => toggle(i)}
                      />
                    </td>
                    <td style={cell}>{r.line}</td>
                    <td style={cell}>{r.location}</td>
                    <td style={cell}>{r.description}</td>
                    <td style={cell}>{r.priority !== null ? PRIORITY[r.priority] : "-"}</td>
                    <td style={{ ...cell, color: r.error ? "crimson" : "#16a34a" }}>
                      {r.error || (r.done ? "Enregistré" : "Valide")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button style={{ marginTop: 10 }} onClick={handleImport} disabled={busy || toSend.length === 0}>
            Enregistrer {toSend.length} signalement(s) sur la blockchain
          </button>
        </>
      )}

      {progress && <p>{progress}</p>}
      {msg.text && <p style={{ color: msg.ok ? "#16a34a" : "crimson", wordBreak: "break-all" }}>{msg.text}</p>}
    </div>
  );
}