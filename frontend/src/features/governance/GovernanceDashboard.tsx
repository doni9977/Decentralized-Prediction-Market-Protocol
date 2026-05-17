import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi, governanceTokenAbi, governorAbi, vaultAbi } from "./abis";
import { governanceAddresses } from "./addresses";
import { GET_PROPOSALS } from "./queries";
import { subgraphRequest } from "./subgraph";

const proposalStateLabels = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];
const deploymentFileByChain: Record<number, string> = {
  31337: "localhost",
  84532: "baseSepolia",
  421614: "arbitrumSepolia"
};

type ProposalSummary = {
  id: bigint;
  title: string;
};

type GovernanceDashboardProps = {
  proposals?: ProposalSummary[];
};

type ProposalResponse = {
  proposals: Array<{
    id: string;
    description: string;
  }>;
};

type DeploymentFile = {
  GovernanceToken?: `0x${string}`;
  PredictionGovernor?: `0x${string}`;
  FeeAsset?: `0x${string}`;
  UpgradeableFeeVaultProxy?: `0x${string}`;
};

function friendlyError(error: unknown) {
  if (!error) return "";
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("User rejected")) return "Transaction rejected in wallet.";
  if (message.includes("insufficient funds")) return "Wallet has insufficient funds for gas.";
  return "Transaction failed. Check wallet, network, and proposal status.";
}

export function GovernanceDashboard({ proposals = [] }: GovernanceDashboardProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [deploymentAddresses, setDeploymentAddresses] = useState(governanceAddresses[chainId]);
  const addresses = deploymentAddresses;
  const [delegateInput, setDelegateInput] = useState("");
  const [selectedSupport, setSelectedSupport] = useState<0 | 1 | 2>(1);
  const [depositInput, setDepositInput] = useState("");
  const [indexedProposals, setIndexedProposals] = useState<ProposalSummary[]>(proposals);
  const [isSubgraphLoading, setIsSubgraphLoading] = useState(false);
  const [subgraphError, setSubgraphError] = useState("");

  useEffect(() => {
    setDeploymentAddresses(governanceAddresses[chainId]);
    const deploymentName = deploymentFileByChain[chainId];
    if (!deploymentName) return;

    let cancelled = false;

    async function loadDeployment() {
      try {
        const response = await fetch(`/deployments/${deploymentName}.json`, { cache: "no-store" });
        if (!response.ok) return;
        const deployment = (await response.json()) as DeploymentFile;
        if (cancelled) return;

        if (
          deployment.GovernanceToken &&
          deployment.PredictionGovernor &&
          deployment.FeeAsset &&
          deployment.UpgradeableFeeVaultProxy
        ) {
          setDeploymentAddresses({
            chainId,
            governanceToken: deployment.GovernanceToken,
            governor: deployment.PredictionGovernor,
            feeAsset: deployment.FeeAsset,
            feeVault: deployment.UpgradeableFeeVaultProxy
          });
        }
      } catch {
        // Static fallback addresses stay active when no deployment file is published.
      }
    }

    loadDeployment();

    return () => {
      cancelled = true;
    };
  }, [chainId]);

  const wrongNetwork = !addresses || addresses.governor === "0x0000000000000000000000000000000000000000";
  const delegatee = useMemo(() => {
    if (delegateInput && isAddress(delegateInput)) return delegateInput;
    return address;
  }, [address, delegateInput]);

  const balance = useReadContract({
    address: addresses?.governanceToken,
    abi: governanceTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && !wrongNetwork) }
  });

  const vaultAssets = useReadContract({
    address: addresses?.feeVault,
    abi: vaultAbi,
    functionName: "totalAssets",
    query: { enabled: Boolean(addresses?.feeVault && !wrongNetwork) }
  });

  const vaultShares = useReadContract({
    address: addresses?.feeVault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && !wrongNetwork) }
  });

  const assetDecimals = useReadContract({
    address: addresses?.feeAsset,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: Boolean(addresses?.feeAsset && !wrongNetwork) }
  });

  const assetAllowance = useReadContract({
    address: addresses?.feeAsset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && addresses?.feeVault ? [address, addresses.feeVault] : undefined,
    query: { enabled: Boolean(address && addresses?.feeVault && !wrongNetwork) }
  });

  const votingPower = useReadContract({
    address: addresses?.governanceToken,
    abi: governanceTokenAbi,
    functionName: "getVotes",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && !wrongNetwork) }
  });

  const currentDelegate = useReadContract({
    address: addresses?.governanceToken,
    abi: governanceTokenAbi,
    functionName: "delegates",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && !wrongNetwork) }
  });

  const { data: txHash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    let cancelled = false;

    async function loadProposals() {
      if (proposals.length > 0) {
        setIndexedProposals(proposals);
        return;
      }

      setIsSubgraphLoading(true);
      setSubgraphError("");

      try {
        const data = await subgraphRequest<ProposalResponse>(GET_PROPOSALS, { first: 10 });

        if (!cancelled) {
          setIndexedProposals(
            data.proposals.map((proposal) => ({
              id: BigInt(proposal.id),
              title: proposal.description || `Proposal ${proposal.id}`
            }))
          );
        }
      } catch {
        if (!cancelled) {
          setSubgraphError("Could not load indexed proposals.");
        }
      } finally {
        if (!cancelled) {
          setIsSubgraphLoading(false);
        }
      }
    }

    loadProposals();

    return () => {
      cancelled = true;
    };
  }, [proposals]);

  function delegateVotes() {
    if (!addresses || !delegatee) return;
    writeContract({
      address: addresses.governanceToken,
      abi: governanceTokenAbi,
      functionName: "delegate",
      args: [delegatee]
    });
  }

  function vote(proposalId: bigint) {
    if (!addresses) return;
    writeContract({
      address: addresses.governor,
      abi: governorAbi,
      functionName: "castVote",
      args: [proposalId, selectedSupport]
    });
  }

  function approveVault() {
    if (!addresses || !depositInput) return;
    const decimals = assetDecimals.data ?? 18;
    const amount = parseUnits(depositInput, decimals);

    writeContract({
      address: addresses.feeAsset,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.feeVault, amount]
    });
  }

  function depositToVault() {
    if (!addresses || !depositInput || !address) return;
    const decimals = assetDecimals.data ?? 18;
    const amount = parseUnits(depositInput, decimals);

    writeContract({
      address: addresses.feeVault,
      abi: vaultAbi,
      functionName: "deposit",
      args: [amount, address]
    });
  }

  if (!isConnected) {
    return <section className="governance-panel">Connect wallet to view DAO governance.</section>;
  }

  if (wrongNetwork) {
    return <section className="governance-panel">Switch to a supported deployment network.</section>;
  }

  return (
    <section className="governance-panel">
      <header className="governance-header">
        <div>
          <h2>DAO Governance</h2>
          <p>{address}</p>
        </div>
        <div className="governance-stats">
          <span>Balance {formatUnits(balance.data ?? 0n, 18)} PGOV</span>
          <span>Votes {formatUnits(votingPower.data ?? 0n, 18)}</span>
          <span>Vault assets {formatUnits(vaultAssets.data ?? 0n, assetDecimals.data ?? 18)}</span>
          <span>Vault shares {formatUnits(vaultShares.data ?? 0n, 18)}</span>
        </div>
      </header>

      <div className="governance-delegation">
        <label htmlFor="delegatee">Delegate</label>
        <input
          id="delegatee"
          value={delegateInput}
          onChange={(event) => setDelegateInput(event.target.value)}
          placeholder={address}
        />
        <button type="button" onClick={delegateVotes} disabled={isPending || !delegatee}>
          Delegate
        </button>
        <span>Current {currentDelegate.data ?? "none"}</span>
      </div>

      <div className="governance-vote-mode">
        <button type="button" onClick={() => setSelectedSupport(1)} aria-pressed={selectedSupport === 1}>
          For
        </button>
        <button type="button" onClick={() => setSelectedSupport(0)} aria-pressed={selectedSupport === 0}>
          Against
        </button>
        <button type="button" onClick={() => setSelectedSupport(2)} aria-pressed={selectedSupport === 2}>
          Abstain
        </button>
      </div>

      <div className="governance-vault">
        <label htmlFor="deposit">Vault deposit (fee asset)</label>
        <input
          id="deposit"
          value={depositInput}
          onChange={(event) => setDepositInput(event.target.value)}
          placeholder="0.0"
        />
        <div className="governance-vault-actions">
          <button type="button" onClick={approveVault} disabled={isPending || !depositInput}>
            Approve
          </button>
          <button type="button" onClick={depositToVault} disabled={isPending || !depositInput}>
            Deposit
          </button>
        </div>
        <span>Allowance {formatUnits(assetAllowance.data ?? 0n, assetDecimals.data ?? 18)}</span>
      </div>

      <div className="governance-proposals">
        {isSubgraphLoading ? (
          <p>Loading proposals...</p>
        ) : indexedProposals.length === 0 ? (
          <p>No indexed proposals yet.</p>
        ) : (
          indexedProposals.map((proposal) => (
            <ProposalRow
              key={proposal.id.toString()}
              proposal={proposal}
              governor={addresses.governor}
              onVote={() => vote(proposal.id)}
              disabled={isPending}
            />
          ))
        )}
      </div>

      {receipt.isSuccess && <p className="governance-success">Transaction confirmed.</p>}
      {subgraphError && <p className="governance-error">{subgraphError}</p>}
      {error && <p className="governance-error">{friendlyError(error)}</p>}
    </section>
  );
}

function ProposalRow({
  proposal,
  governor,
  onVote,
  disabled
}: {
  proposal: ProposalSummary;
  governor: `0x${string}`;
  onVote: () => void;
  disabled: boolean;
}) {
  const state = useReadContract({
    address: governor,
    abi: governorAbi,
    functionName: "state",
    args: [proposal.id]
  });

  const stateLabel = proposalStateLabels[Number(state.data ?? 0)] ?? "Unknown";

  return (
    <article className="governance-proposal">
      <div>
        <h3>{proposal.title}</h3>
        <p>{stateLabel}</p>
      </div>
      <button type="button" onClick={onVote} disabled={disabled || stateLabel !== "Active"}>
        Vote
      </button>
    </article>
  );
}
