import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { getAccount } from "@wagmi/core";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

export function registerGetAccountTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "get-account",
    description: "Get the current account.",
    parameters: z.object({}),
    execute: async () => {
      try {
        // Try bridge first if available
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            const accounts = await bridgeClient.getAccounts();
            const chainId = await bridgeClient.getChainId();
            
            if (accounts.length > 0) {
              bridgeClient.disconnect();
              return {
                content: [
                  {
                    type: "text",
                    text: JSONStringify({
                      address: accounts[0],
                      addresses: accounts,
                      chainId: parseInt(chainId, 16),
                      status: "connected",
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
        const result = getAccount(wagmiConfig);
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                address: result.address,
                addresses: result.addresses,
                chainId: result.chainId,
                status: result.status,
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
                address: null,
                addresses: [],
                chainId: null,
                status: "disconnected",
                error: (error as Error).message,
              }),
            },
          ],
        };
      }
    },
  });
};
