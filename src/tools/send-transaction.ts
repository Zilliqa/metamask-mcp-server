import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { sendTransaction } from "@wagmi/core";
import { TransactionExecutionError } from "viem";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

export function registerSendTransactionTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "send-transaction",
    description: "Send transactions to networks.",
    parameters: z.object({
      to: z.string().describe("The transaction recipient or contract address."),
      data: z.string().describe("A contract hashed method call with encoded args (use '0x' for no data)."),
      value: z.string().describe("Value in wei sent with this transaction (use '0' for no value)."),
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
            
            // Get the current account first
            const accounts = await bridgeClient.getAccounts();
            if (accounts.length === 0) {
              throw new Error("No accounts available. Please connect MetaMask first.");
            }
            
            const transactionArgs: any = {
              from: accounts[0], // Add the from address
              to: args.to,
            };
            
            // Handle data parameter (use '0x' for no data)
            if (args.data && args.data !== '0x') {
              transactionArgs.data = args.data;
            }
            
            // Handle value parameter (use '0' for no value)
            if (args.value && args.value !== '0') {
              transactionArgs.value = args.value; // Keep as string for bridge
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
        const transactionArgs: any = {
          to: args.to,
        };
        
        // Handle data parameter (use '0x' for no data)
        if (args.data && args.data !== '0x') {
          transactionArgs.data = args.data;
        }
        
        // Handle value parameter (use '0' for no value)
        if (args.value && args.value !== '0') {
          transactionArgs.value = BigInt(args.value);
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
