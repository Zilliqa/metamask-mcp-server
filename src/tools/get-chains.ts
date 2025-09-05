import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

export function registerGetChainsTools(server: FastMCP): void {
  server.addTool({
    name: "get-chains",
    description: "Get the chains configured in MetaMask (both default and custom networks).",
    parameters: z.object({}),
    execute: async () => {
      try {
        // Try bridge first to get actual chains from MetaMask
        const bridgeClient = createBridgeClient();
        if (bridgeClient) {
          try {
            await bridgeClient.connect();
            
            // Get current chain ID from MetaMask
            const currentChainId = await bridgeClient.getChainId();
            const accounts = await bridgeClient.getAccounts();
            
            // Get permissions to see what chains are available
            let permissions = [];
            try {
              permissions = await bridgeClient.getPermissions();
            } catch (error) {
              console.warn("Could not get permissions:", error);
            }
            
            // Get the current chain information
            const currentChainIdInt = parseInt(currentChainId, 16);
            
            // Try to get more detailed network information from MetaMask
            let networkDetails = null;
            try {
              // Get network name and other details if available
              const networkName = await bridgeClient.request("net_version", []);
              networkDetails = {
                chainId: currentChainIdInt,
                chainIdHex: currentChainId,
                networkId: parseInt(networkName, 10),
                networkName: networkName
              };
            } catch (error) {
              console.warn("Could not get network details:", error);
              networkDetails = {
                chainId: currentChainIdInt,
                chainIdHex: currentChainId,
                networkId: currentChainIdInt,
                networkName: currentChainIdInt.toString()
              };
            }
            
            // Create a comprehensive result with current chain info
            const currentChain = {
              id: currentChainIdInt,
              name: `MetaMask Network (ID: ${currentChainIdInt})`,
              isCurrent: true,
              chainIdHex: currentChainId,
              networkDetails: networkDetails,
              isConnected: accounts.length > 0
            };
            
            bridgeClient.disconnect();
            
            const result = {
              currentChain: currentChain,
              accounts: accounts,
              permissions: permissions,
              note: "This shows the current active network in MetaMask. MetaMask doesn't expose an API to list all configured networks. To see other networks, use the switch-chain tool to switch to them first, then call get-chains again.",
              limitation: "MetaMask API limitation: Cannot enumerate all configured networks without switching to each one individually.",
              suggestion: "Use switch-chain tool to switch to different networks, then call get-chains again to see each network's details."
            };
            
            return {
              content: [
                {
                  type: "text",
                  text: JSONStringify(result),
                },
              ],
            };
          } catch (error) {
            console.warn("Bridge request failed:", error);
            if (bridgeClient) {
              bridgeClient.disconnect();
            }
          }
        }
        
        // Fallback when bridge is not available
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                error: "Bridge not available",
                message: "MetaMask bridge is not connected. Please use the connect-extension tool to start the bridge and connect to MetaMask.",
                instructions: [
                  "1. Use the connect-extension tool to start the bridge automatically",
                  "2. Open the relay tab URL provided by the tool",
                  "3. Connect MetaMask in the relay tab",
                  "4. Try get-chains again"
                ]
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
                message: "Failed to get chain information from MetaMask"
              }),
            },
          ],
        };
      }
    },
  });
};
