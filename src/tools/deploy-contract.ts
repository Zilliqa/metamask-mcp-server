import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { deployContract } from "@wagmi/core";
import { TransactionExecutionError } from "viem";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";

export function registerDeployContractTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "deploy-contract",
    description: "Deploy a contract to the network, given bytecode, and constructor arguments.",
    parameters: z.object({
      abi: z.string().describe("The contract's ABI as a JSON string."),
      args: z.string().optional().describe("Arguments to pass when deploying the contract as JSON string (use '[]' for no arguments)."),
      bytecode: z.string().describe("The contract's bytecode as a hex string."),
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
                text: `Error parsing ABI: ${e.message}. Use JSON format like '[{"type":"constructor","inputs":[]}]'.`,
              },
            ],
          };
        }
        
        // Parse the args from JSON string
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
          bytecode: args.bytecode,
          ...(parsedArgs.length > 0 && { args: parsedArgs }),
        };
        
        const result = await deployContract(wagmiConfig, contractArgs);
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
