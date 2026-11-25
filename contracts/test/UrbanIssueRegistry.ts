import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Les enums arrivent sous forme de nombres (bigint) depuis le contrat
const S = { Reported: 0n, Assigned: 1n, InProgress: 2n, Resolved: 3n, Closed: 4n };
const P = { Low: 0, Medium: 1, High: 2, Critical: 3 };

const LOC = "Rue Hassan II, Casablanca";
const DESC = "Lampadaire en panne devant l'ecole";

describe("UrbanIssueRegistry", () => {
  let registry: any, admin: any, agent: any, citizen: any, outsider: any;
  let MUNICIPAL_ROLE: string;

  // ----- Fonctions d'aide -----

  const create = (signer: any = citizen, loc = LOC, desc = DESC, prio = P.High) =>
    registry.connect(signer).createIssue(loc, desc, prio);

  const assign = (id: number, team = "Equipe Eclairage", comment = "Equipe envoyee") =>
    registry.connect(agent).assignTeam(id, team, comment);

  const setStatus = (id: number, status: bigint | number, comment = "") =>
    registry.connect(agent).updateStatus(id, status, comment);

  const eventsOf = async (tx: any, name: string) => {
    const receipt = await tx.wait();
    return receipt.logs
      .map((log: any) => {
        try { return registry.interface.parseLog(log); } catch { return null; }
      })
      .filter((e: any) => e && e.name === name);
  };

  const input = (i: number) => ({
    location: `Avenue ${i}, Casablanca`,
    description: `Probleme numero ${i}`,
    priority: P.Medium,
  });

  beforeEach(async () => {
    [admin, agent, citizen, outsider] = await ethers.getSigners();
    registry = await ethers.deployContract("UrbanIssueRegistry");
    MUNICIPAL_ROLE = await registry.MUNICIPAL_ROLE();
    // L'admin donne le rôle municipal à un agent
    await registry.grantRole(MUNICIPAL_ROLE, agent.address);
  });

  // ---------- Déploiement ----------

  it("donne les rôles admin et municipal au déployeur", async () => {
    const adminRole = await registry.DEFAULT_ADMIN_ROLE();
    assert.equal(await registry.hasRole(adminRole, admin.address), true);
    assert.equal(await registry.hasRole(MUNICIPAL_ROLE, admin.address), true);
    assert.equal(await registry.hasRole(MUNICIPAL_ROLE, citizen.address), false);
  });

  // ---------- Création ----------

  it("un citoyen crée un signalement et le relit", async () => {
    await create();
    assert.equal(await registry.totalIssues(), 1n);

    const issue = await registry.getIssue(1);
    assert.equal(issue.id, 1n);
    assert.equal(issue.reporter, citizen.address);
    assert.equal(issue.location, LOC);
    assert.equal(issue.description, DESC);
    assert.equal(issue.priority, 2n);
    assert.equal(issue.status, S.Reported);
    assert.equal(issue.assignedTeam, "");
    assert.ok(issue.createdAt > 0n);
    assert.equal(issue.updatedAt, issue.createdAt);
  });

  it("émet l'event IssueCreated", async () => {
    const tx = await create();
    const [event] = await eventsOf(tx, "IssueCreated");
    assert.ok(event, "event IssueCreated introuvable");
    assert.equal(event.args.id, 1n);
    assert.equal(event.args.reporter, citizen.address);
    assert.equal(event.args.priority, 2n);
  });

  it("crée la première entrée d'historique", async () => {
    await create();
    const history = await registry.getHistory(1);
    assert.equal(history.length, 1);
    assert.equal(history[0].actor, citizen.address);
    assert.equal(history[0].status, S.Reported);
    assert.equal(history[0].team, "");
    assert.equal(history[0].comment, "Signalement cree");
    assert.ok(history[0].timestamp > 0n);
  });

  it("attribue des identifiants uniques et croissants", async () => {
    await create();
    await create();
    await create();
    assert.equal(await registry.totalIssues(), 3n);
    assert.equal((await registry.getIssue(1)).id, 1n);
    assert.equal((await registry.getIssue(2)).id, 2n);
    assert.equal((await registry.getIssue(3)).id, 3n);
  });

  it("refuse une localisation vide", async () => {
    await assert.rejects(create(citizen, "", DESC), /Localisation vide/);
  });

  it("refuse une description vide", async () => {
    await assert.rejects(create(citizen, LOC, ""), /Description vide/);
  });

  it("refuse une localisation trop longue", async () => {
    await assert.rejects(
      create(citizen, "x".repeat(121), DESC),
      /Localisation trop longue/
    );
  });

  it("refuse une description trop longue", async () => {
    await assert.rejects(
      create(citizen, LOC, "x".repeat(501)),
      /Description trop longue/
    );
  });

  it("getIssue échoue pour un identifiant inexistant", async () => {
    await assert.rejects(registry.getIssue(99), /Signalement inexistant/);
    await assert.rejects(registry.getIssue(0), /Signalement inexistant/);
  });

  it("la consultation est publique (aucun rôle nécessaire)", async () => {
    await create();
    const issue = await registry.connect(outsider).getIssue(1);
    const history = await registry.connect(outsider).getHistory(1);
    assert.equal(issue.location, LOC);
    assert.equal(history.length, 1);
    assert.equal(await registry.connect(outsider).getHistoryLength(1), 1n);
  });

  // ---------- Affectation ----------

  it("un agent affecte une équipe : statut Assigned et historique", async () => {
    await create();
    await assign(1, "Equipe Eclairage", "Equipe envoyee");

    const issue = await registry.getIssue(1);
    assert.equal(issue.status, S.Assigned);
    assert.equal(issue.assignedTeam, "Equipe Eclairage");

    const history = await registry.getHistory(1);
    assert.equal(history.length, 2);
    assert.equal(history[1].actor, agent.address);
    assert.equal(history[1].status, S.Assigned);
    assert.equal(history[1].team, "Equipe Eclairage");
    assert.equal(history[1].comment, "Equipe envoyee");
  });

  it("émet TeamAssigned et StatusUpdated à l'affectation", async () => {
    await create();
    const tx = await assign(1);
    const [team] = await eventsOf(tx, "TeamAssigned");
    const [status] = await eventsOf(tx, "StatusUpdated");

    assert.ok(team, "event TeamAssigned introuvable");
    assert.equal(team.args.id, 1n);
    assert.equal(team.args.team, "Equipe Eclairage");
    assert.equal(team.args.actor, agent.address);

    assert.ok(status, "event StatusUpdated introuvable");
    assert.equal(status.args.oldStatus, S.Reported);
    assert.equal(status.args.newStatus, S.Assigned);
  });

  it("refuse l'affectation à un citoyen", async () => {
    await create();
    await assert.rejects(
      registry.connect(citizen).assignTeam(1, "Equipe", ""),
      /AccessControlUnauthorizedAccount/
    );
    assert.equal((await registry.getIssue(1)).status, S.Reported);
  });

  it("refuse un nom d'équipe vide", async () => {
    await create();
    await assert.rejects(assign(1, ""), /Equipe vide/);
  });

  it("permet de réaffecter une équipe sans changer le statut", async () => {
    await create();
    await assign(1, "Equipe A");
    await setStatus(1, S.InProgress, "Debut des travaux");
    await assign(1, "Equipe B", "Renfort");

    const issue = await registry.getIssue(1);
    assert.equal(issue.status, S.InProgress);
    assert.equal(issue.assignedTeam, "Equipe B");
    assert.equal(await registry.getHistoryLength(1), 4n);
  });

  // ---------- Statuts ----------

  it("parcourt tout le cycle de vie et trace chaque étape", async () => {
    await create();
    await assign(1);
    await setStatus(1, S.InProgress, "Debut des travaux");
    await setStatus(1, S.Resolved, "Lampadaire repare");
    await setStatus(1, S.Closed, "Verifie par le service");

    assert.equal((await registry.getIssue(1)).status, S.Closed);

    const history = await registry.getHistory(1);
    assert.equal(history.length, 5);
    assert.deepEqual(
      history.map((h: any) => h.status),
      [S.Reported, S.Assigned, S.InProgress, S.Resolved, S.Closed]
    );
    assert.deepEqual(
      history.map((h: any) => h.actor),
      [citizen.address, agent.address, agent.address, agent.address, agent.address]
    );
    assert.equal(history[3].comment, "Lampadaire repare");
    assert.equal(history[3].team, "Equipe Eclairage");
  });

  it("refuse le changement de statut à un citoyen", async () => {
    await create();
    await assign(1);
    await assert.rejects(
      registry.connect(citizen).updateStatus(1, S.InProgress, ""),
      /AccessControlUnauthorizedAccount/
    );
  });

  it("refuse de traiter un signalement non affecté", async () => {
    await create();
    await assert.rejects(
      setStatus(1, S.InProgress),
      /Affecter d'abord une equipe/
    );
  });

  it("refuse de sauter une étape", async () => {
    await create();
    await assign(1);
    await assert.rejects(setStatus(1, S.Resolved), /Transition de statut invalide/);
    await assert.rejects(setStatus(1, S.Closed), /Transition de statut invalide/);
    assert.equal((await registry.getIssue(1)).status, S.Assigned);
  });

  it("refuse de revenir en arrière ou d'aller après Closed", async () => {
    await create();
    await assign(1);
    await setStatus(1, S.InProgress);
    await assert.rejects(setStatus(1, S.Assigned), /Transition de statut invalide/);

    await setStatus(1, S.Resolved);
    await setStatus(1, S.Closed);
    await assert.rejects(setStatus(1, S.Closed), /Transition de statut invalide/);
  });

  it("refuse d'affecter une équipe après la résolution", async () => {
    await create();
    await assign(1);
    await setStatus(1, S.InProgress);
    await setStatus(1, S.Resolved);
    await assert.rejects(assign(1, "Equipe C"), /deja resolu/);
  });

  it("refuse un commentaire trop long", async () => {
    await create();
    await assign(1);
    await assert.rejects(
      setStatus(1, S.InProgress, "x".repeat(301)),
      /Commentaire trop long/
    );
  });

  it("émet StatusUpdated avec l'ancien et le nouveau statut", async () => {
    await create();
    await assign(1);
    const tx = await setStatus(1, S.InProgress, "Debut");
    const [event] = await eventsOf(tx, "StatusUpdated");
    assert.ok(event, "event StatusUpdated introuvable");
    assert.equal(event.args.id, 1n);
    assert.equal(event.args.oldStatus, S.Assigned);
    assert.equal(event.args.newStatus, S.InProgress);
    assert.equal(event.args.actor, agent.address);
  });

  // ---------- Import en lot ----------

  it("batchCreateIssues crée plusieurs signalements pour un agent", async () => {
    await registry.connect(agent).batchCreateIssues([input(1), input(2), input(3)]);
    assert.equal(await registry.totalIssues(), 3n);

    const issue = await registry.getIssue(2);
    assert.equal(issue.location, "Avenue 2, Casablanca");
    assert.equal(issue.reporter, agent.address);
    assert.equal(issue.status, S.Reported);
    assert.equal(await registry.getHistoryLength(3), 1n);
  });

  it("batchCreateIssues refuse un citoyen", async () => {
    await assert.rejects(
      registry.connect(citizen).batchCreateIssues([input(1)]),
      /AccessControlUnauthorizedAccount/
    );
  });

  it("batchCreateIssues refuse un lot vide", async () => {
    await assert.rejects(registry.connect(agent).batchCreateIssues([]), /Lot vide/);
  });

  it("batchCreateIssues est annulé en entier si une ligne est invalide", async () => {
    const bad = { location: "", description: "Sans lieu", priority: P.Low };
    await assert.rejects(
      registry.connect(agent).batchCreateIssues([input(1), input(2), bad]),
      /Localisation vide/
    );
    assert.equal(await registry.totalIssues(), 0n);
  });

  it("batchCreateIssues refuse un lot trop grand", async () => {
    const big = Array.from({ length: 51 }, (_, i) => input(i + 1));
    await assert.rejects(
      registry.connect(agent).batchCreateIssues(big),
      /Lot trop grand/
    );
  });

  // ---------- Pagination ----------

  it("getIssues renvoie des pages de signalements", async () => {
    for (let i = 0; i < 5; i++) await create();

    const first = await registry.getIssues(0, 2);
    assert.deepEqual(first.map((x: any) => x.id), [1n, 2n]);

    const last = await registry.getIssues(3, 10);
    assert.deepEqual(last.map((x: any) => x.id), [4n, 5n]);

    assert.equal((await registry.getIssues(5, 3)).length, 0);
    assert.equal((await registry.getIssues(10, 1)).length, 0);
  });

  // ---------- Gestion des rôles ----------

  it("l'admin attribue puis retire le rôle municipal", async () => {
    await create();
    await registry.grantRole(MUNICIPAL_ROLE, outsider.address);
    await registry.connect(outsider).assignTeam(1, "Equipe D", "");
    assert.equal((await registry.getIssue(1)).status, S.Assigned);

    await registry.revokeRole(MUNICIPAL_ROLE, outsider.address);
    await assert.rejects(
      registry.connect(outsider).updateStatus(1, S.InProgress, ""),
      /AccessControlUnauthorizedAccount/
    );
  });

  it("un non-admin ne peut pas attribuer le rôle municipal", async () => {
    await assert.rejects(
      registry.connect(citizen).grantRole(MUNICIPAL_ROLE, citizen.address),
      /AccessControlUnauthorizedAccount/
    );
  });
});