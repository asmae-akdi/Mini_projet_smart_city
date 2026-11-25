import { useAccount, useReadContract, useWatchContractEvent } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI, MUNICIPAL_ROLE, ADMIN_ROLE } from "./contract";
import { TARGET_CHAIN } from "./network";

// Lit les rôles du compte connecté
export function useRoles() {
  const { address } = useAccount();

  const query = (role) => ({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "hasRole",
    args: [role, address],
    chainId: TARGET_CHAIN.id,
    query: { enabled: !!address },
  });

  const municipal = useReadContract(query(MUNICIPAL_ROLE));
  const admin = useReadContract(query(ADMIN_ROLE));

  return {
    isMunicipal: municipal.data === true,
    isAdmin: admin.data === true,
  };
}
// Appelle onEvent dès que le contrat émet un événement (création, affectation, statut)
export function useLiveRefresh(onEvent) {
  const base = {
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    chainId: TARGET_CHAIN.id,
    onLogs: () => onEvent(),
  };
  useWatchContractEvent({ ...base, eventName: "IssueCreated" });
  useWatchContractEvent({ ...base, eventName: "TeamAssigned" });
  useWatchContractEvent({ ...base, eventName: "StatusUpdated" });
}