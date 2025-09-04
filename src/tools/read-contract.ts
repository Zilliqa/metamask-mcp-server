import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { readContract } from "@wagmi/core";
import { TransactionExecutionError } from "viem";
import { z } from "zod";

export function registerReadContractTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "read-contract",
    description: "Call a read-only function on a contract, and returning the response.",
    parameters: z.object({
      abi: z.string().describe("The contract's ABI as a JSON string."),
      address: z.string().describe("The contract's address."),
      functionName: z.string().describe("Function to call on the contract."),
      args: z.string().describe("Arguments to pass when calling the contract as JSON string (use '[]' for no arguments)."),
      chainId: z.coerce.number().optional().describe("ID of chain to use when fetching data."),
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
                text: `Error parsing ABI: ${e.message}. Use JSON format like '[{"type":"function","name":"balanceOf","inputs":[{"name":"account","type":"address"}]}]'.`,
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
        
        const contractArgs = {
          abi: parsedAbi,
          address: args.address,
          functionName: args.functionName,
          args: parsedArgs,
          ...(args.chainId && { chainId: args.chainId }),
        };
        
        const result = await readContract(wagmiConfig, contractArgs);
        return {
          content: [
            {
              type: "text",
              text: `${result}`,
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
