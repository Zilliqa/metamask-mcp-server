import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { call } from "@wagmi/core";
import { TransactionExecutionError } from "viem";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";

export function registerCallTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "call",
    description: "Executing a new message call immediately without submitting a transaction to the network.",
    parameters: z.object({
      to: z.string().describe("The contract address or recipient."),
      data: z.string().describe("A contract hashed method call with encoded args."),
      value: z.string().optional().describe("Value (in wei) sent with this transaction."),
    }),
    execute: async (args) => {
      try {
        const callArgs: any = {
          to: args.to,
          data: args.data,
        };
        
        // Handle value parameter
        if (args.value) {
          callArgs.value = BigInt(args.value);
        }
        
        const result = await call(wagmiConfig, callArgs);
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                data: result,
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
