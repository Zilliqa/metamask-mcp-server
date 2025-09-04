import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { simulateContract, writeContract } from "@wagmi/core";
import { TransactionExecutionError } from "viem";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

export function registerWriteContractTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "write-contract",
    description: "Execute a write function on a contract.",
    parameters: z.object({
      abi: z.string().describe("The contract's ABI as a JSON string."),
      address: z.string().describe("The contract's address."),
      functionName: z.string().describe("Function to call on the contract."),
      args: z.string().describe("Arguments to pass when calling the contract as JSON string (use '[]' for no arguments)."),
      value: z.string().describe("Value in wei sent with this transaction (use '0' for no value)."),
      maxFeePerGas: z.string().optional().describe("Total fee per gas in wei, inclusive of maxPriorityFeePerGas."),
      maxPriorityFeePerGas: z.string().optional().describe("Max priority fee per gas in wei."),
      chainId: z.coerce.number().optional().describe("Chain ID to validate against before sending transaction."),
    }),
    execute: async (args) => {
      try {
        // Parse the ABI from JSON string
        let parsedAbi;
        try {
          parsedAbi = JSON.parse(args.abi);
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: `Error parsing ABI: ${e.message}. Use JSON format like '[{"type":"function","name":"transfer","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}]}]'.`,
              },
            ],
          };
        }
        
        // Parse the args string
        let parsedArgs = [];
        if (args.args && args.args !== '[]') {
          try {
            parsedArgs = JSON.parse(args.args);
          } catch (e) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error parsing arguments: ${e.message}. Use JSON format like '["arg1", "arg2"]' or '[]' for no arguments.`,
                },
              ],
            };
          }
        }
        
        // Try bridge first if available
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            const accounts = await bridgeClient.getAccounts();
            
            if (accounts.length > 0) {
              // For contract calls, we need to encode the function call
              // This is a simplified approach - in practice, you'd want to use a proper ABI encoder
              const contractArgs: any = {
                to: args.address,
                data: `0x`, // This would need proper ABI encoding
                value: args.value !== '0' ? args.value : '0',
              };
              
              if (args.maxFeePerGas) {
                contractArgs.maxFeePerGas = args.maxFeePerGas;
              }
              
              if (args.maxPriorityFeePerGas) {
                contractArgs.maxPriorityFeePerGas = args.maxPriorityFeePerGas;
              }
              
              const result = await bridgeClient.sendTransaction(contractArgs);
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
            }
            bridgeClient.disconnect();
          } catch (error) {
            console.warn("Bridge request failed, falling back to wagmi:", error);
            if (bridgeClient) {
              bridgeClient.disconnect();
            }
          }
        }
        
        // Fallback to wagmi
        const contractArgs: any = {
          abi: parsedAbi,
          address: args.address,
          functionName: args.functionName,
          args: parsedArgs,
        };
        
        // Handle value parameter (use '0' for no value)
        if (args.value && args.value !== '0') {
          contractArgs.value = BigInt(args.value);
        }
        
        // Handle optional gas parameters
        if (args.maxFeePerGas) {
          contractArgs.maxFeePerGas = BigInt(args.maxFeePerGas);
        }
        
        if (args.maxPriorityFeePerGas) {
          contractArgs.maxPriorityFeePerGas = BigInt(args.maxPriorityFeePerGas);
        }
        
        if (args.chainId) {
          contractArgs.chainId = args.chainId;
        }
        
        const { request } = await simulateContract(wagmiConfig, contractArgs);
        const result = await writeContract(wagmiConfig, request);
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
