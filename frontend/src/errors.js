import { BaseError, ContractFunctionRevertedError } from "viem";

// Transforme une erreur technique en phrase compréhensible
export function friendlyError(err) {
  if (err instanceof BaseError) {
    if (err.shortMessage?.includes("User rejected")) {
      return "Transaction rejetée dans MetaMask.";
    }
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
            if (revert.data?.errorName === "AccessControlUnauthorizedAccount") {
        return "Ce compte n'a pas le rôle requis pour cette action.";
      }
      return revert.reason || revert.shortMessage;
    }
    return err.shortMessage || err.message;
  }
  return err.message || String(err);
}