// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title UrbanIssueRegistry
/// @notice Registre de signalements urbains avec suivi du cycle de vie et historique
contract UrbanIssueRegistry is AccessControl {
    // ---------- Rôles ----------

    bytes32 public constant MUNICIPAL_ROLE = keccak256("MUNICIPAL_ROLE");

    // ---------- Types ----------

    enum Status { Reported, Assigned, InProgress, Resolved, Closed }
    enum Priority { Low, Medium, High, Critical }

    struct Issue {
        uint256 id;
        address reporter;
        string location;
        string description;
        Priority priority;
        Status status;
        string assignedTeam;
        uint64 createdAt;
        uint64 updatedAt;
    }

    struct HistoryEntry {
        uint64 timestamp;
        address actor;
        Status status;
        string team;
        string comment;
    }

    struct IssueInput {
        string location;
        string description;
        Priority priority;
    }

    // ---------- Limites ----------

    uint256 public constant MAX_LOCATION = 120;
    uint256 public constant MAX_DESCRIPTION = 500;
    uint256 public constant MAX_TEAM = 60;
    uint256 public constant MAX_COMMENT = 300;
    uint256 public constant MAX_BATCH = 50;

    // ---------- Stockage ----------

    uint256 public totalIssues;
    mapping(uint256 => Issue) private _issues;
    mapping(uint256 => HistoryEntry[]) private _history;

    // ---------- Événements ----------

    event IssueCreated(
        uint256 indexed id,
        address indexed reporter,
        Priority priority
    );
    event TeamAssigned(
        uint256 indexed id,
        string team,
        address indexed actor
    );
    event StatusUpdated(
        uint256 indexed id,
        Status oldStatus,
        Status newStatus,
        address indexed actor
    );

    // ---------- Construction ----------

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MUNICIPAL_ROLE, msg.sender);
    }

    modifier issueExists(uint256 id) {
        require(id > 0 && id <= totalIssues, "Signalement inexistant");
        _;
    }

    // ---------- Création ----------

    /// @notice Tout le monde peut déclarer un problème
    function createIssue(
        string calldata location,
        string calldata description,
        Priority priority
    ) external returns (uint256) {
        return _create(location, description, priority);
    }

    /// @notice Import en lot, réservé au personnel municipal
    function batchCreateIssues(
        IssueInput[] calldata inputs
    ) external onlyRole(MUNICIPAL_ROLE) {
        require(inputs.length > 0, "Lot vide");
        require(inputs.length <= MAX_BATCH, "Lot trop grand");
        for (uint256 i = 0; i < inputs.length; i++) {
            IssueInput calldata c = inputs[i];
            _create(c.location, c.description, c.priority);
        }
    }

    function _create(
        string calldata location,
        string calldata description,
        Priority priority
    ) internal returns (uint256 id) {
        require(bytes(location).length > 0, "Localisation vide");
        require(bytes(location).length <= MAX_LOCATION, "Localisation trop longue");
        require(bytes(description).length > 0, "Description vide");
        require(bytes(description).length <= MAX_DESCRIPTION, "Description trop longue");

        totalIssues++;
        id = totalIssues;

        _issues[id] = Issue({
            id: id,
            reporter: msg.sender,
            location: location,
            description: description,
            priority: priority,
            status: Status.Reported,
            assignedTeam: "",
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });

        _record(id, Status.Reported, "", "Signalement cree");
        emit IssueCreated(id, msg.sender, priority);
    }

    // ---------- Traitement (personnel municipal) ----------

    /// @notice Affecte (ou réaffecte) une équipe. Fait passer Reported -> Assigned.
    function assignTeam(
        uint256 id,
        string calldata team,
        string calldata comment
    ) external onlyRole(MUNICIPAL_ROLE) issueExists(id) {
        require(bytes(team).length > 0, "Equipe vide");
        require(bytes(team).length <= MAX_TEAM, "Nom d'equipe trop long");
        require(bytes(comment).length <= MAX_COMMENT, "Commentaire trop long");

        Issue storage issue = _issues[id];
        require(
            issue.status == Status.Reported ||
                issue.status == Status.Assigned ||
                issue.status == Status.InProgress,
            "Signalement deja resolu"
        );

        Status oldStatus = issue.status;
        issue.assignedTeam = team;
        issue.status = oldStatus == Status.Reported ? Status.Assigned : oldStatus;
        issue.updatedAt = uint64(block.timestamp);

        _record(id, issue.status, team, comment);
        emit TeamAssigned(id, team, msg.sender);
        if (oldStatus != issue.status) {
            emit StatusUpdated(id, oldStatus, issue.status, msg.sender);
        }
    }

    /// @notice Fait avancer le statut d'une étape : Assigned -> InProgress -> Resolved -> Closed
    function updateStatus(
        uint256 id,
        Status newStatus,
        string calldata comment
    ) external onlyRole(MUNICIPAL_ROLE) issueExists(id) {
        require(bytes(comment).length <= MAX_COMMENT, "Commentaire trop long");

        Issue storage issue = _issues[id];
        require(issue.status != Status.Reported, "Affecter d'abord une equipe");
        require(
            uint8(newStatus) == uint8(issue.status) + 1,
            "Transition de statut invalide"
        );

        Status oldStatus = issue.status;
        issue.status = newStatus;
        issue.updatedAt = uint64(block.timestamp);

        _record(id, newStatus, issue.assignedTeam, comment);
        emit StatusUpdated(id, oldStatus, newStatus, msg.sender);
    }

    function _record(
        uint256 id,
        Status status,
        string memory team,
        string memory comment
    ) internal {
        _history[id].push(
            HistoryEntry({
                timestamp: uint64(block.timestamp),
                actor: msg.sender,
                status: status,
                team: team,
                comment: comment
            })
        );
    }

    // ---------- Consultation publique (gratuite) ----------

    function getIssue(
        uint256 id
    ) external view issueExists(id) returns (Issue memory) {
        return _issues[id];
    }

    function getHistory(
        uint256 id
    ) external view issueExists(id) returns (HistoryEntry[] memory) {
        return _history[id];
    }

    function getHistoryLength(
        uint256 id
    ) external view issueExists(id) returns (uint256) {
        return _history[id].length;
    }

    /// @notice Renvoie une page de signalements (offset commence à 0)
    function getIssues(
        uint256 offset,
        uint256 limit
    ) external view returns (Issue[] memory page) {
        if (offset >= totalIssues) {
            return new Issue[](0);
        }
        uint256 end = offset + limit;
        if (end > totalIssues) end = totalIssues;

        page = new Issue[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _issues[i + 1];
        }
    }
}