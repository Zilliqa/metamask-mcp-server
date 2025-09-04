import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { getChains } from "@wagmi/core";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

export function registerGetChainsTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "get-chains",
    description: "Get the configured chains.",
    parameters: z.object({}),
    execute: async () => {
      try {
        // Try bridge first to get actual chains from MetaMask
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            
            // Get current chain ID from MetaMask
            const currentChainId = await bridgeClient.getChainId();
            const accounts = await bridgeClient.getAccounts();
            
            // Get permissions to see what chains are available
            let permissions = [];
            try {
              permissions = await bridgeClient.getPermissions();
            } catch (error) {
              console.warn("Could not get permissions:", error);
            }
            
            bridgeClient.disconnect();
            
            // Get configured chains from wagmi
            const configuredChains = getChains(wagmiConfig);
            
            // Create a comprehensive chain list
            const result = {
              currentChainId: parseInt(currentChainId, 16),
              currentChainIdHex: currentChainId,
              accounts: accounts,
              permissions: permissions,
              configuredChains: configuredChains.map(chain => ({
                id: chain.id,
                name: chain.name,
                network: chain.network,
                nativeCurrency: chain.nativeCurrency,
                rpcUrls: chain.rpcUrls,
                blockExplorers: chain.blockExplorers,
                testnet: chain.testnet,
              })),
              // Add some common chains that might be in MetaMask but not in wagmi config
              commonChains: [
                { id: 1, name: "Ethereum Mainnet", network: "homestead", testnet: false },
                { id: 11155111, name: "Sepolia", network: "sepolia", testnet: true },
                { id: 137, name: "Polygon", network: "matic", testnet: false },
                { id: 56, name: "BNB Smart Chain", network: "bsc", testnet: false },
                { id: 42161, name: "Arbitrum One", network: "arbitrum", testnet: false },
                { id: 10, name: "Optimism", network: "optimism", testnet: false },
                { id: 250, name: "Fantom", network: "fantom", testnet: false },
                { id: 43114, name: "Avalanche", network: "avalanche", testnet: false },
              ]
            };
            
            return {
              content: [
                {
                  type: "text",
                  text: JSONStringify(result),
                },
              ],
            };
          } catch (error) {
            console.warn("Bridge request failed, falling back to wagmi:", error);
            if (bridgeClient) {
              bridgeClient.disconnect();
            }
          }
        }
        
        // Fallback to wagmi only
        const result = getChains(wagmiConfig);
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                configuredChains: result.map(chain => ({
                  id: chain.id,
                  name: chain.name,
                  network: chain.network,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrls: chain.rpcUrls,
                  blockExplorers: chain.blockExplorers,
                  testnet: chain.testnet,
                })),
                note: "Using configured chains only. Connect to bridge to get MetaMask chains."
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                error: (error as Error).message,
                configuredChains: getChains(wagmiConfig).map(chain => ({
                  id: chain.id,
                  name: chain.name,
                  network: chain.network,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrls: chain.rpcUrls,
                  blockExplorers: chain.blockExplorers,
                  testnet: chain.testnet,
                })),
              }),
            },
          ],
        };
      }
    },
  });
};
