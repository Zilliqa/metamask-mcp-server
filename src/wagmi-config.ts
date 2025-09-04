import { createConfig, createStorage, http } from "@wagmi/core";
import { mainnet, sepolia } from "@wagmi/core/chains";
import { createClient, defineChain } from "viem";
import { MetaMaskBridgeClient } from "./bridge-client";

// Define Zilliqa chains
const zilliqaTestnet = defineChain({
  id: 33101,
  name: "Zilliqa Testnet",
  network: "zilliqa-testnet",
  nativeCurrency: {
    decimals: 12,
    name: "Zilliqa",
    symbol: "ZIL",
  },
  rpcUrls: {
    default: {
      http: ["https://dev-api.zilliqa.com"],
    },
    public: {
      http: ["https://dev-api.zilliqa.com"],
    },
  },
  blockExplorers: {
    default: { name: "Zilliqa Testnet Explorer", url: "https://dev-explorer.zilliqa.com" },
  },
  testnet: true,
});

const zilliqaMainnet = defineChain({
  id: 1,
  name: "Zilliqa Mainnet",
  network: "zilliqa-mainnet",
  nativeCurrency: {
    decimals: 12,
    name: "Zilliqa",
    symbol: "ZIL",
  },
  rpcUrls: {
    default: {
      http: ["https://api.zilliqa.com"],
    },
    public: {
      http: ["https://api.zilliqa.com"],
    },
  },
  blockExplorers: {
    default: { name: "Zilliqa Explorer", url: "https://explorer.zilliqa.com" },
  },
  testnet: false,
});

export async function createWagmiConfig() {
  // Simple file-based storage for wagmi
  const storage = {
    getItem: async (key: string) => {
      return null; // We'll handle connection via bridge
    },
    setItem: async (key: string, value: string) => {
      // No persistent storage needed
    },
    removeItem: async (key: string) => {
      // No persistent storage needed
    },
  };

  return createConfig({
    chains: [mainnet, sepolia, zilliqaTestnet, zilliqaMainnet],
    ssr: true,
    storage: createStorage({ storage }),
    client({ chain }) {
      return createClient({
        chain,
        transport: http(),
      });
    },
  });
}

// Bridge client will be created per-request to avoid circular dependencies
export function createBridgeClient(): MetaMaskBridgeClient | null {
  try {
    return new MetaMaskBridgeClient();
  } catch (error) {
    console.warn("Could not create bridge client:", error);
    return null;
  }
}
