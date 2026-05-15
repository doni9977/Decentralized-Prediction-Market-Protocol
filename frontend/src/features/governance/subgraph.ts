export const SUBGRAPH_URL =
  import.meta.env.VITE_SUBGRAPH_URL || "https://api.thegraph.com/subgraphs/name/example/prediction-market";

export async function subgraphRequest<TData>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<TData> {
  const response = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error("Subgraph request failed.");
  }

  const payload = (await response.json()) as { data?: TData; errors?: Array<{ message: string }> };

  if (payload.errors && payload.errors.length > 0) {
    throw new Error("Subgraph returned an error.");
  }

  if (!payload.data) {
    throw new Error("Subgraph response is empty.");
  }

  return payload.data;
}
