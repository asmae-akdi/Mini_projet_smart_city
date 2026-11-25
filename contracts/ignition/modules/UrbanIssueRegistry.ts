import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("UrbanIssueRegistryModule", (m) => {
  const registry = m.contract("UrbanIssueRegistry");
  return { registry };
});