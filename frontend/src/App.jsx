import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { TARGET_CHAIN } from "./network";
import CreateIssueForm from "./CreateIssueForm";
import { useRoles, useLiveRefresh } from "./hooks";
import PublicExplorer from "./PublicExplorer";
import IssueDetail from "./IssueDetail";
import AdminPanel from "./AdminPanel";
import ImportPanel from "./ImportPanel";

function WalletBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { isAdmin, isMunicipal } = useRoles();

  if (!isConnected) {
    return (
      <button onClick={() => connect({ connector: connectors[0] })}>
        Connecter MetaMask
      </button>
    );
  }

  let role = "Citoyen";
  if (isAdmin && isMunicipal) role = "Administrateur et agent municipal";
  else if (isAdmin) role = "Administrateur";
  else if (isMunicipal) role = "Agent municipal";

  return (
    <div>
      <p>Connecté : <code>{address}</code></p>
      {chainId !== TARGET_CHAIN.id && (
        <p style={{ color: "crimson" }}>
          Mauvais réseau.{" "}
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}>
            Passer sur {TARGET_CHAIN.name}
          </button>
        </p>
      )}
      <p>Rôle de ce compte : <strong>{role}</strong></p>
      <button onClick={() => disconnect()}>Déconnecter</button>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("citizen");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const { isConnected } = useAccount();
  const { isMunicipal, isAdmin } = useRoles();

  const refresh = () => setRefreshKey((k) => k + 1);
  useLiveRefresh(refresh);
  const switchTab = (name) => {
    setTab(name);
    setSelectedId(null);
  };

  const tabStyle = (name) => ({
    padding: "8px 16px",
    marginRight: 8,
    cursor: "pointer",
    fontWeight: tab === name ? "bold" : "normal",
    borderBottom: tab === name ? "3px solid #646cff" : "3px solid transparent",
    background: "transparent",
    border: "none",
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Smart City : signalements urbains</h1>
            <p style={{ color: "#6b7280" }}>
        Consultation publique : la liste et l'historique des signalements sont lisibles par tous,
        sans portefeuille et sans frais. Seules les actions (déclarer, traiter) demandent MetaMask.
      </p>
      <WalletBar />

      <div style={{ margin: "16px 0" }}>
        <button style={tabStyle("citizen")} onClick={() => switchTab("citizen")}>
          Espace citoyen
        </button>
        <button style={tabStyle("municipal")} onClick={() => switchTab("municipal")}>
          Espace municipal
        </button>
      </div>

      {tab === "citizen" && <CreateIssueForm onCreated={refresh} />}

      {tab === "municipal" && (
        <>
          {!isConnected && <p>Connecte un compte d'agent municipal pour gérer les signalements.</p>}
          {isConnected && !isMunicipal && (
            <p style={{ color: "crimson" }}>
              Ce compte n'est pas un agent municipal : la gestion est désactivée (consultation seule).
            </p>
          )}
          {isAdmin && <AdminPanel />}
          {isMunicipal && <ImportPanel onImported={refresh} />}
        </>
      )}

      <hr />
          <PublicExplorer refreshKey={refreshKey} onSelect={(i) => setSelectedId(i.id)} />

      {selectedId !== null && (
        <IssueDetail
          issueId={selectedId}
          canManage={tab === "municipal" && isMunicipal}
          refreshKey={refreshKey}
          onChanged={refresh}
        />
      )}
    </div>
  );
}