import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { signMessage } from "@wagmi/core";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

export function registerSignMessageTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "sign-message",
    description: "Sign a message.",
    parameters: z.object({
      message: z.string().describe("Message to sign."),
    }),
    execute: async (args, { log }) => {
      try {
        // Try bridge first if available
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            const accounts = await bridgeClient.getAccounts();
            
            if (accounts.length > 0) {
              const result = await bridgeClient.personalSign(args.message, accounts[0]);
              bridgeClient.disconnect();
              
              return {
                content: [
                  {
                    type: "text",
                    text: JSONStringify({
                      signature: result,
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
        const result = await signMessage(wagmiConfig, {
          message: args.message,
        });
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                signature: result,
              }),
            },
          ],
        };
      }
      catch (error) {
        log.debug((error as Error).message);
        throw error;
      }
    },
  });
};
