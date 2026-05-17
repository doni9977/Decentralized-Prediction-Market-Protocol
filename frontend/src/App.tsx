import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { GovernanceDashboard } from "./features/governance";
import { PredictionMarketDashboard } from "./features/market";

type SubgraphProposal = {
  id: string;
  description?: string | null;
};

type ProposalSummary = {
  id: bigint;
  title: string;
};

const SUBGRAPH_URL = import.meta.env.VITE_SUBGRAPH_URL as string | undefined;

export function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [subgraphError, setSubgraphError] = useState<string>("");

  useEffect(() => {
    async function loadProposals() {
      if (!SUBGRAPH_URL) {
        setSubgraphError("Subgraph URL is not configured.");
        return;
      }

      try {
        const response = await fetch(SUBGRAPH_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: `query Proposals($first: Int!) {
              proposals(first: $first, orderBy: endBlock, orderDirection: desc) {
                id
                description
              }
            }`,
            variables: { first: 8 }
          })
        });

        const payload = await response.json();
        if (payload.errors) {
          setSubgraphError("Subgraph query failed.");
          return;
        }

        const items = (payload.data?.proposals ?? []) as SubgraphProposal[];
        setProposals(
          items.map((proposal) => ({
            id: BigInt(proposal.id),
            title: proposal.description?.split("\n")[0] || `Proposal ${proposal.id}`
          }))
        );
      } catch (error) {
        setSubgraphError("Subgraph request failed.");
      }
    }

    loadProposals();
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Prediction Market</h1>
          <p>Trade outcomes, resolve markets, and manage governance.</p>
        </div>
        <div className="wallet-actions">
          {isConnected ? (
            <>
              <span className="wallet-address">{address}</span>
              <button type="button" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            connectors.map((connector) => (
              <button
                key={connector.uid}
                type="button"
                onClick={() => connect({ connector })}
                disabled={isPending}
              >
                {connector.name}
              </button>
            ))
          )}
        </div>
      </header>

      {subgraphError && <p className="banner warning">{subgraphError}</p>}
      <PredictionMarketDashboard />
      <GovernanceDashboard proposals={proposals} />
    </main>
  );
}
