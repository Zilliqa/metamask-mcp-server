import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { getBalance } from "@wagmi/core";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";
import { formatUnits } from "viem";

export function registerGetBalanceTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "get-native-currency-balance",
    description: "Get the native currency balance of an address.",
    parameters: z.object({
      address: z.string().describe("Address to get balance for."),
    }),
    execute: async (args) => {
      try {
        // Try bridge first to get accurate balance with correct decimals
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            
            // Get current chain ID from bridge
            const chainIdHex = await bridgeClient.getChainId();
            const chainId = parseInt(chainIdHex, 16);
            
            // Get balance via bridge
            const balanceHex = await bridgeClient.request("eth_getBalance", [args.address, "latest"]);
            const balanceWei = BigInt(balanceHex);
            
            // Determine correct decimals based on chain
            // Try to get chain info from MetaMask first
            let decimals = 18; // Default to Ethereum decimals
            let symbol = "ETH"; // Default symbol
            
            // Known chain configurations (can be extended)
            const chainConfigs: Record<number, { decimals: number; symbol: string; name: string }> = {
              1: { decimals: 18, symbol: "ETH", name: "Ethereum Mainnet" },
              11155111: { decimals: 18, symbol: "ETH", name: "Sepolia" },
              137: { decimals: 18, symbol: "MATIC", name: "Polygon" },
              56: { decimals: 18, symbol: "BNB", name: "BNB Smart Chain" },
              42161: { decimals: 18, symbol: "ETH", name: "Arbitrum One" },
              10: { decimals: 18, symbol: "ETH", name: "Optimism" },
              250: { decimals: 18, symbol: "FTM", name: "Fantom" },
              43114: { decimals: 18, symbol: "AVAX", name: "Avalanche" },
              33101: { decimals: 12, symbol: "ZIL", name: "Zilliqa Testnet" },
              // Note: Zilliqa Mainnet uses chain ID 1, same as Ethereum, but different network
            };
            
            const config = chainConfigs[chainId];
            if (config) {
              decimals = config.decimals;
              symbol = config.symbol;
            }
            
            // Format balance with correct decimals
            const formattedBalance = formatUnits(balanceWei, decimals);
            
            bridgeClient.disconnect();
            
            return {
              content: [
                {
                  type: "text",
                  text: JSONStringify({
                    address: args.address,
                    balance: formattedBalance,
                    balanceWei: balanceWei.toString(),
                    decimals: decimals,
                    chainId: chainId,
                    symbol: symbol
                  }),
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

        // Fallback to wagmi
        const result = await getBalance(wagmiConfig, args);
        return {
          content: [
            {
              type: "text",
              text: JSONStringify(result),
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
              }),
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: "get-token-balance",
    description: "Get token balance of an address.",
    parameters: z.object({
      address: z.string().describe("Address to get balance for."),
      token: z.string().describe("ERC-20 token address to get balance for."),
    }),
    execute: async (args) => {
      try {
        // Try bridge first to get accurate balance with correct decimals
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            
            // Get current chain ID from bridge
            const chainIdHex = await bridgeClient.getChainId();
            const chainId = parseInt(chainIdHex, 16);
            
            // For ERC-20 tokens, we need to call the contract's balanceOf function
            // This is a simplified version - in practice you'd need proper ABI encoding
            const balanceHex = await bridgeClient.request("eth_call", [{
              to: args.token,
              data: `0x70a08231000000000000000000000000${args.address.slice(2)}` // balanceOf(address) selector + address
            }, "latest"]);
            
            const balanceWei = BigInt(balanceHex);
            
            // Determine correct decimals based on chain
            let decimals = 18; // Default to Ethereum decimals
            if (chainId === 33101 || chainId === 1) {
              // Zilliqa chains use 12 decimals
              decimals = 12;
            }
            
            // Format balance with correct decimals
            const formattedBalance = formatUnits(balanceWei, decimals);
            
            bridgeClient.disconnect();
            
            return {
              content: [
                {
                  type: "text",
                  text: JSONStringify({
                    address: args.address,
                    token: args.token,
                    balance: formattedBalance,
                    balanceWei: balanceWei.toString(),
                    decimals: decimals,
                    chainId: chainId,
                    symbol: symbol
                  }),
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

        // Fallback to wagmi
        const result = await getBalance(wagmiConfig, args);
        return {
          content: [
            {
              type: "text",
              text: JSONStringify(result),
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
              }),
            },
          ],
        };
      }
    },
  });
};
