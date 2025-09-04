import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { switchChain } from "@wagmi/core";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

export function registerSwitchChainTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "switch-chain",
    description: "Switch the target chain.",
    parameters: z.object({
      chainId: z.coerce.number().describe("ID of chain to switch to."),
      addEthereumChainParameter: z.object({
        chainName: z.string(),
        nativeCurrency: z.object({
          name: z.string(),
          symbol: z.string(),
          decimals: z.coerce.number(),
        }),
        rpcUrls: z.string().array().min(1),
        blockExplorerUrls: z.string().array().optional(),
        iconUrls: z.string().array().optional(),
      }).optional().describe("Add not configured chains to Ethereum wallets."),
    }),
    execute: async (args) => {
      try {
        // Try bridge first if available
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            
            // Switch chain via bridge
            const chainIdHex = `0x${args.chainId.toString(16)}`;
            const result = await bridgeClient.switchEthereumChain(chainIdHex);
            bridgeClient.disconnect();
            
            return {
              content: [
                {
                  type: "text",
                  text: JSONStringify({
                    success: true,
                    chainId: args.chainId,
                    message: "Chain switched successfully via bridge",
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
        const chainId = args.chainId as typeof wagmiConfig["chains"][number]["id"];
        const addEthereumChainParameter = args.addEthereumChainParameter;

        const result = await switchChain(wagmiConfig, {
          chainId,
          addEthereumChainParameter,
        });

        wagmiConfig._internal.chains.setState(x => [...x, result]);

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
                success: false,
                error: (error as Error).message,
              }),
            },
          ],
        };
      }
    },
  });
};
