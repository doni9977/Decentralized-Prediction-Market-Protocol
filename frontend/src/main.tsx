import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arbitrumSepolia, baseSepolia, hardhat } from "wagmi/chains";
import { App } from "./App";
import "./styles.css";

const queryClient = new QueryClient();
const config = createConfig({
  chains: [hardhat, baseSepolia, arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(import.meta.env.VITE_HARDHAT_RPC_URL || "http://127.0.0.1:8545"),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http()
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
