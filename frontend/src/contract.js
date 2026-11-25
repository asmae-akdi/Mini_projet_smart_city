import { parseAbi, keccak256, toBytes, zeroHash } from "viem";

export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Identifiants des rôles (identiques à ceux du contrat)
export const MUNICIPAL_ROLE = keccak256(toBytes("MUNICIPAL_ROLE"));
export const ADMIN_ROLE = zeroHash; // DEFAULT_ADMIN_ROLE vaut 0x00...00

// Les enums du contrat (Status, Priority) sont encodés en uint8
export const CONTRACT_ABI = parseAbi([
  "struct Issue { uint256 id; address reporter; string location; string description; uint8 priority; uint8 status; string assignedTeam; uint64 createdAt; uint64 updatedAt; }",
  "struct HistoryEntry { uint64 timestamp; address actor; uint8 status; string team; string comment; }",
  "struct IssueInput { string location; string description; uint8 priority; }",
  "function totalIssues() view returns (uint256)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getIssue(uint256 id) view returns (Issue)",
  "function getHistory(uint256 id) view returns (HistoryEntry[])",
  "function getIssues(uint256 offset, uint256 limit) view returns (Issue[])",
  "function createIssue(string location, string description, uint8 priority) returns (uint256)",
  "function batchCreateIssues(IssueInput[] inputs)",
  "function assignTeam(uint256 id, string team, string comment)",
  "function updateStatus(uint256 id, uint8 newStatus, string comment)",
  "event IssueCreated(uint256 indexed id, address indexed reporter, uint8 priority)",
  "event TeamAssigned(uint256 indexed id, string team, address indexed actor)",
  "event StatusUpdated(uint256 indexed id, uint8 oldStatus, uint8 newStatus, address indexed actor)",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
]);