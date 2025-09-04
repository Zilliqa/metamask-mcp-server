import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { sendTransaction } from "@wagmi/core";
import { TransactionExecutionError, parseUnits, formatUnits } from "viem";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

// Helper function to get chain information from ChainList
async function getChainInfo(chainId: number): Promise<{ decimals: number; symbol: string; name: string }> {
  // Special cases where ChainList data might be incorrect
  const specialCases: Record<number, { decimals: number; symbol: string; name: string }> = {
    // Add special cases here only when ChainList data is actually wrong
    // Zilliqa uses 18 decimals (same as ChainList), so no special case needed
  };

  // Check special cases first
  if (specialCases[chainId]) {
    console.log(`🔧 Using special case for chain ${chainId}:`, specialCases[chainId]);
    return specialCases[chainId];
  }

  try {
    const url = "https://chainlist.org/rpcs.json";
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch chain list: ${response.status}`);
    }
    
    const chainListData = await response.json();
    
    // Find the chain by ID
    const chain = chainListData.find((c: any) => c.chainId === chainId);
    
    if (chain) {
      const chainInfo = {
        decimals: chain.nativeCurrency?.decimals || 18,
        symbol: chain.nativeCurrency?.symbol || "ETH",
        name: chain.name || `Chain ${chainId}`
      };
      console.log(`📡 ChainList data for ${chainId}:`, chainInfo);
      return chainInfo;
    }
    
    // Fallback for unknown chains
    console.warn(`Chain ID ${chainId} not found in ChainList, using default values`);
    return {
      decimals: 18,
      symbol: "ETH",
      name: `Unknown Chain ${chainId}`
    };
  } catch (error) {
    console.warn(`Failed to fetch chain info for ${chainId}:`, error);
    // Fallback to default values
    return {
      decimals: 18,
      symbol: "ETH", 
      name: `Chain ${chainId}`
    };
  }
}

// Helper function to convert human-readable value to wei hex
async function convertValueToWeiHex(value: string, chainId: number): Promise<string> {
  if (value === '0' || !value) {
    return '0x0';
  }

  try {
    // Get chain information dynamically
    const chainInfo = await getChainInfo(chainId);
    console.log(`🔍 Chain info for ${chainId}:`, chainInfo);
    
    // Parse the value (e.g., "100 ZIL" -> "100", "1.5 ETH" -> "1.5")
    const numericValue = parseFloat(value.replace(/[^\d.-]/g, ''));
    if (isNaN(numericValue)) {
      throw new Error(`Invalid value format: ${value}`);
    }

    // Convert to wei using the chain's decimals
    const weiValue = parseUnits(numericValue.toString(), chainInfo.decimals);
    
    // Convert to hex
    return `0x${weiValue.toString(16)}`;
  } catch (error) {
    throw new Error(`Failed to convert value "${value}" to wei: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function registerSendTransactionTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "send-transaction",
    description: "Send transactions to networks.",
    parameters: z.object({
      to: z.string().describe("The transaction recipient or contract address."),
      data: z.string().describe("A contract hashed method call with encoded args (use '0x' for no data)."),
      value: z.string().describe("Value to send (e.g., '100 ZIL', '1.5 ETH', '0' for no value). Will be automatically converted to wei based on network decimals."),
      maxFeePerGas: z.string().optional().describe("Total fee per gas in wei, inclusive of maxPriorityFeePerGas."),
      maxPriorityFeePerGas: z.string().optional().describe("Max priority fee per gas in wei."),
      chainId: z.coerce.number().optional().describe("Chain ID to validate against before sending transaction."),
    }),
    execute: async (args) => {
      try {
        // Try bridge first if available
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            
            // Get the current account and chain ID first
            const accounts = await bridgeClient.getAccounts();
            if (accounts.length === 0) {
              throw new Error("No accounts available. Please connect MetaMask first.");
            }
            
            const chainIdHex = await bridgeClient.getChainId();
            const chainId = parseInt(chainIdHex, 16);
            
            const transactionArgs: any = {
              from: accounts[0], // Add the from address
              to: args.to,
            };
            
            // Handle data parameter (use '0x' for no data)
            if (args.data && args.data !== '0x') {
              transactionArgs.data = args.data;
            }
            
            // Handle value parameter - convert human-readable value to wei hex
            if (args.value && args.value !== '0') {
              console.log(`🔄 BRIDGE: Converting value "${args.value}" for chain ${chainId}...`);
              const weiHex = await convertValueToWeiHex(args.value, chainId);
              console.log(`✅ BRIDGE: Converted to wei hex: ${weiHex}`);
              transactionArgs.value = weiHex;
            } else {
              transactionArgs.value = '0x0';
            }
            
            // Handle optional gas parameters
            if (args.maxFeePerGas) {
              transactionArgs.maxFeePerGas = args.maxFeePerGas; // Keep as string for bridge
            }
            
            if (args.maxPriorityFeePerGas) {
              transactionArgs.maxPriorityFeePerGas = args.maxPriorityFeePerGas; // Keep as string for bridge
            }
            
            if (args.chainId) {
              transactionArgs.chainId = args.chainId;
            }
            
            const result = await bridgeClient.sendTransaction(transactionArgs);
            bridgeClient.disconnect();
            
            return {
              content: [
                {
                  type: "text",
                  text: JSONStringify({
                    hash: result,
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
        // Get chain ID from wagmi config for value conversion
        const chains = wagmiConfig.chains;
        const chainId = args.chainId || (chains.length > 0 ? chains[0].id : 1);
        
        const transactionArgs: any = {
          to: args.to,
        };
        
        // Handle data parameter (use '0x' for no data)
        if (args.data && args.data !== '0x') {
          transactionArgs.data = args.data;
        }
        
        // Handle value parameter - convert human-readable value to wei
        if (args.value && args.value !== '0') {
          console.log(`🔄 WAGMI: Converting value "${args.value}" for chain ${chainId}...`);
          const weiHex = await convertValueToWeiHex(args.value, chainId);
          console.log(`✅ WAGMI: Converted to wei hex: ${weiHex}`);
          transactionArgs.value = BigInt(weiHex);
        } else {
          transactionArgs.value = BigInt(0);
        }
        
        // Handle optional gas parameters
        if (args.maxFeePerGas) {
          transactionArgs.maxFeePerGas = BigInt(args.maxFeePerGas);
        }
        
        if (args.maxPriorityFeePerGas) {
          transactionArgs.maxPriorityFeePerGas = BigInt(args.maxPriorityFeePerGas);
        }
        
        if (args.chainId) {
          transactionArgs.chainId = args.chainId;
        }
        
        const result = await sendTransaction(wagmiConfig, transactionArgs);
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                hash: result,
              }),
            },
          ],
        };
      }
      catch (error) {
        if (error instanceof TransactionExecutionError) {
          return {
            content: [
              {
                type: "text",
                text: error.cause.message,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: (error as Error).message,
            },
          ],
        };
      }
    },
  });
};
