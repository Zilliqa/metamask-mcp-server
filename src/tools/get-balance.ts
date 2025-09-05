import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { getBalance } from "@wagmi/core";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";
import { formatUnits } from "viem";
import { getChainInfo } from "../utils/chain-data";

export function registerGetBalanceTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "get-native-currency-balance",
    description: "Get the native currency balance of an address.",
    parameters: z.object({
      address: z.string().describe("Address to get balance for."),
    }),
    execute: async (args) => {
      try {
        console.log("🚀 REQUEST: Getting native currency balance for", args.address);
        
        // Try bridge first to get accurate balance with correct decimals
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            console.log("🔗 BRIDGE: Connected to bridge");
            
            // Get current chain ID from bridge
            const chainIdHex = await bridgeClient.getChainId();
            const chainId = parseInt(chainIdHex, 16);
            console.log("🔍 DEBUG: Current chain ID:", chainId);
            
            // Get balance via bridge
            const balanceHex = await bridgeClient.request("eth_getBalance", [args.address, "latest"]);
            const balanceWei = BigInt(balanceHex);
            console.log("🔍 DEBUG: Balance in wei:", balanceWei.toString());
            
            // Get chain information dynamically from ChainList
            console.log("📡 NETWORK: Fetching chain info from ChainList...");
            const chainInfo = await getChainInfo(chainId);
            
            // Format balance with correct decimals
            const formattedBalance = formatUnits(balanceWei, chainInfo.decimals);
            console.log("🔄 CONVERSION: Formatted balance:", formattedBalance, chainInfo.symbol);
            
            bridgeClient.disconnect();
            
            return {
              content: [
                {
                  type: "text",
                  text: JSONStringify({
                    address: args.address,
                    balance: formattedBalance,
                    balanceWei: balanceWei.toString(),
                    decimals: chainInfo.decimals,
                    chainId: chainId,
                    symbol: chainInfo.symbol,
                    chainName: chainInfo.name,
                    source: "bridge"
                  }),
                },
              ],
            };
          } catch (error) {
            console.warn("❌ ERROR: Bridge request failed, falling back to wagmi:", error);
            if (bridgeClient) {
              bridgeClient.disconnect();
            }
          }
        }

        // Fallback to wagmi
        console.log("🔄 FALLBACK: Using wagmi for balance retrieval");
        const result = await getBalance(wagmiConfig, args);
        
        // Try to get chain info for wagmi result too
        let chainInfo = { decimals: 18, symbol: "ETH", name: "Unknown Chain" };
        try {
          // Get chain ID from wagmi config
          const chainId = wagmiConfig.chains[0]?.id || 1; // Default to mainnet
          chainInfo = await getChainInfo(chainId);
        } catch (error) {
          console.warn("Could not get chain info for wagmi fallback:", error);
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                ...result,
                chainInfo: chainInfo,
                source: "wagmi"
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
        console.log("🚀 REQUEST: Getting token balance for", args.address, "token:", args.token);
        
        // Try bridge first to get accurate balance with correct decimals
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            console.log("🔗 BRIDGE: Connected to bridge");
            
            // Get current chain ID from bridge
            const chainIdHex = await bridgeClient.getChainId();
            const chainId = parseInt(chainIdHex, 16);
            console.log("🔍 DEBUG: Current chain ID:", chainId);
            
            // For ERC-20 tokens, we need to call the contract's balanceOf function
            // This is a simplified version - in practice you'd need proper ABI encoding
            const balanceHex = await bridgeClient.request("eth_call", [{
              to: args.token,
              data: `0x70a08231000000000000000000000000${args.address.slice(2)}` // balanceOf(address) selector + address
            }, "latest"]);
            
            const balanceWei = BigInt(balanceHex);
            console.log("🔍 DEBUG: Token balance in wei:", balanceWei.toString());
            
            // Get chain information dynamically from ChainList
            console.log("📡 NETWORK: Fetching chain info from ChainList...");
            const chainInfo = await getChainInfo(chainId);
            
            // Format balance with correct decimals (tokens typically use 18 decimals)
            const formattedBalance = formatUnits(balanceWei, chainInfo.decimals);
            console.log("🔄 CONVERSION: Formatted token balance:", formattedBalance);
            
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
                    decimals: chainInfo.decimals,
                    chainId: chainId,
                    symbol: chainInfo.symbol,
                    chainName: chainInfo.name,
                    source: "bridge"
                  }),
                },
              ],
            };
          } catch (error) {
            console.warn("❌ ERROR: Bridge request failed, falling back to wagmi:", error);
            if (bridgeClient) {
              bridgeClient.disconnect();
            }
          }
        }

        // Fallback to wagmi
        console.log("🔄 FALLBACK: Using wagmi for token balance retrieval");
        const result = await getBalance(wagmiConfig, args);
        
        // Try to get chain info for wagmi result too
        let chainInfo = { decimals: 18, symbol: "ETH", name: "Unknown Chain" };
        try {
          // Get chain ID from wagmi config
          const chainId = wagmiConfig.chains[0]?.id || 1; // Default to mainnet
          chainInfo = await getChainInfo(chainId);
        } catch (error) {
          console.warn("Could not get chain info for wagmi fallback:", error);
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                ...result,
                chainInfo: chainInfo,
                source: "wagmi"
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
              }),
            },
          ],
        };
      }
    },
  });
};