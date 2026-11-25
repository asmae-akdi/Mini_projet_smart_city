# Smart City & Blockchain : registre de signalements urbains

DApp de signalement et de suivi des problèmes urbains (éclairage public, voirie, déchets...).
Les signalements et leur historique sont stockés sur la blockchain : ils sont **publics,
horodatés et non modifiables** après coup.

Projet réalisé dans le cadre du Master IDAI par Asmae akdi

## Fonctionnalités

- **Citoyen** : déclarer un signalement (localisation, description, priorité).
- **Municipalité** : affecter ou réaffecter une équipe, faire avancer le statut
  `Signalé → Affecté → En cours → Résolu → Clôturé`, avec un commentaire à chaque étape.
- **Import en masse** Excel / CSV : lecture, validation, aperçu et enregistrement par lots de 10.
- **Traçabilité** : chaque action est enregistrée dans l'historique (date, statut, équipe,
  commentaire, adresse de l'auteur).
- **Consultation publique** sans portefeuille : liste, statistiques, filtres, export CSV.
- **Administration** : l'administrateur ajoute ou retire des agents municipaux.

## Architecture

```
smart-city/
├── contracts/   Hardhat 3 : contrat Solidity, tests, déploiement (Ignition)
└── frontend/    React + Vite, wagmi 2, viem 2, SheetJS
```

### Contrat `UrbanIssueRegistry`

| Élément | Choix |
|---|---|
| Rôles | OpenZeppelin `AccessControl` : `DEFAULT_ADMIN_ROLE` (gère les agents), `MUNICIPAL_ROLE` (traite les signalements) |
| Statuts | Machine à états : une seule transition vers l'avant à la fois |
| Historique | Tableau `HistoryEntry` par signalement + événements `IssueCreated`, `TeamAssigned`, `StatusUpdated` |
| Lecture | `getIssue`, `getHistory`, `getIssues(offset, limit)` (pagination) |
| Import | `batchCreateIssues` (agent municipal, lot de 50 maximum, atomique) |
| Limites | Taille maximale des textes (localisation 120, description 500, équipe 60, commentaire 300 octets) contre le spam et le gas excessif |

Pas de `ReentrancyGuard` : le contrat ne fait aucun appel externe ni transfert d'ETH.

### Frontend

- Simulation de chaque transaction avant MetaMask : message d'erreur clair en cas de refus.
- Vérification du statut du reçu après confirmation.
- Boutons de gestion affichés selon le rôle du compte (la vraie sécurité est dans le contrat).
- Rafraîchissement automatique grâce aux événements du contrat.

## Installation

Prérequis : Node.js 22+, MetaMask.

```bash
# 1. Contrats
cd contracts
npm install
npx hardhat test            # 32 tests

# 2. Nœud local (terminal 1, à laisser ouvert)
npx hardhat node

# 3. Déploiement (terminal 2)
npx hardhat ignition deploy ignition/modules/UrbanIssueRegistry.ts --network localhost

# 4. Frontend (terminal 3)
cd ../frontend
npm install
npm run dev
```

Adresse du contrat en local : `0x5FbDB2315678afecb367f032d93F642f64180aa3`
(à reporter dans `frontend/src/contract.js` si elle est différente).

### MetaMask

Ajouter le réseau : RPC `http://127.0.0.1:8545`, ID de chaîne `31337`, symbole `ETH`.
Importer des comptes avec les clés privées de test affichées par `npx hardhat node`
(**comptes de test publics, jamais de vrais fonds**).

| Compte | Rôle |
|---|---|
| #0 | Administrateur et agent municipal (déployeur) |
| #1, #2... | Citoyens (ou agents si l'admin leur donne le rôle) |

Après un redémarrage du nœud : redéployer, puis MetaMask → Paramètres → Avancé →
« Effacer les données de l'onglet d'activité » (sinon erreur « Nonce too high »).

## Tests

32 tests automatiques (`contracts/test/UrbanIssueRegistry.ts`) : rôles, création et validations,
affectation, cycle de vie complet et historique, transitions interdites, lots (dont atomicité),
pagination, attribution et retrait de rôle.

## Format du fichier d'import

| location | description | priority |
|---|---|---|
| Avenue Hassan II | Lampadaire éteint depuis 3 jours | Haute |

Priorités acceptées : Basse, Moyenne, Haute, Critique (ou Low, Medium, High, Critical, ou 0 à 3).
Le bouton « Exemple .xlsx » de l'interface génère un fichier de démonstration.



## Limites et pistes d'amélioration

- Les filtres et statistiques sont calculés dans le navigateur : au-delà de quelques milliers
  de signalements, il faudrait un indexeur (The Graph).
- Pas de photo ni de géolocalisation GPS (on pourrait stocker un hash IPFS dans le contrat).
- Seules les données de test locales sont utilisées : pas de déploiement sur un réseau public.