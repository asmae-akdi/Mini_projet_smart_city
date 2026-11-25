// Libellés affichés (le contrat renvoie 0, 1, 2...)
export const STATUS = ["Signalé", "Affecté", "En cours", "Résolu", "Clôturé"];
export const STATUS_COLORS = ["#6b7280", "#2563eb", "#d97706", "#16a34a", "#374151"];

export const PRIORITY = ["Basse", "Moyenne", "Haute", "Critique"];
export const PRIORITY_COLORS = ["#6b7280", "#2563eb", "#d97706", "#dc2626"];

export const MAX_LOCATION = 120;
export const MAX_DESCRIPTION = 500;

export const shortAddress = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const formatDate = (ts) => new Date(Number(ts) * 1000).toLocaleString("fr-FR");

// Le contrat limite la taille en OCTETS (un accent compte pour 2)
export const byteLength = (s) => new TextEncoder().encode(s).length;

export const MAX_TEAM = 60;
export const MAX_COMMENT = 300;