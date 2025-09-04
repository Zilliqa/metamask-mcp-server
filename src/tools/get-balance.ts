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
                    balance: formattedBalance,
                    balanceWei: balanceWei.toString(),
                    decimals: decimals,
                    chainId: chainId,
                    symbol: chainId === 33101 || chainId === 1 ? "ZIL" : "ETH"
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
                    symbol: chainId === 33101 || chainId === 1 ? "ZIL" : "ETH"
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
