import { createConfig, createStorage, http } from "@wagmi/core";
import { mainnet, sepolia } from "@wagmi/core/chains";
import { createClient } from "viem";
import { MetaMaskBridgeClient } from "./bridge-client";

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

  // Use only standard chains - MetaMask networks are handled via bridge
  return createConfig({
    chains: [mainnet, sepolia], // Only include standard chains
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
