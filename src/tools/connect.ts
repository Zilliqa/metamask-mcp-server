import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { connect } from "@wagmi/core";
import { imageContent } from "fastmcp";
import QRCode from "qrcode";
import { z } from "zod";
import { metaMask, MetaMaskParameters } from "../connectors/metamask";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";
import { BridgeServer } from "../bridge-server";

// Global bridge server instance
let bridgeServer: BridgeServer | null = null;

export function registerConnectTools(server: FastMCP, wagmiConfig: Config): void {
  server.addTool({
    name: "get-connect-uri",
    description: "Get the connect URI to connect to a MetaMask wallet.",
    parameters: z.object({}),
    execute: async (_, { log }) => {
      const uri = await getMetaMaskConnectURI(log, wagmiConfig);
      return {
        content: [
          {
            type: "text",
            text: JSONStringify({
              uri,
            }),
          },
        ],
      };
    },
  });

  server.addTool({
    name: "show-connect-qrcode",
    description: "Show the connect QR code for a given connect URI.",
    parameters: z.object({
      uri: z.string().describe("Connect URI"),
    }),
    execute: async (args) => {
      const uri = args.uri;
      const qrCode = await QRCode.toDataURL(uri, {
        width: 200,
      });
      return imageContent({
        url: qrCode,
      });
    },
  });

  server.addTool({
    name: "connect-extension",
    description: "Connect to the MetaMask browser extension via secure bridge. Automatically starts the bridge server if needed.",
    parameters: z.object({}),
    execute: async (_, { log }) => {
      try {
        console.log("🚀 REQUEST: Starting connect-extension tool");
        
        // Start bridge server if not already running
        if (!bridgeServer || !bridgeServer.isServerRunning()) {
          console.log("🔗 BRIDGE: Starting bridge server...");
          bridgeServer = new BridgeServer();
          await bridgeServer.start();
          console.log("✅ BRIDGE: Bridge server started successfully");
        } else {
          console.log("🔗 BRIDGE: Bridge server already running");
        }

        // Wait a moment for the server to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create bridge client
        const bridgeClient = createBridgeClient();
        if (!bridgeClient) {
          return {
            content: [
              {
                type: "text",
                text: JSONStringify({
                  success: false,
                  error: "Bridge client creation failed",
                  message: "Failed to create bridge client after starting server",
                  relayUrl: bridgeServer?.getRelayUrl(),
                  instructions: [
                    "1. Open the relay tab in your browser",
                    "2. Connect MetaMask in the relay tab",
                    "3. Try this command again"
                  ]
                }),
              },
            ],
          };
        }

        console.log("🔗 BRIDGE: Connecting to bridge...");
        await bridgeClient.connect();
        
        console.log("🔗 BRIDGE: Requesting accounts...");
        const accounts = await bridgeClient.requestAccounts();
        bridgeClient.disconnect();
        
        console.log("✅ SUCCESS: Connected to MetaMask via bridge");
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                success: true,
                message: "Successfully connected to MetaMask via secure bridge",
                accounts: accounts,
                relayUrl: bridgeServer?.getRelayUrl(),
                instructions: [
                  "The bridge server is now running automatically",
                  "You can open the relay tab to monitor the connection",
                  "The bridge will continue running until you stop the MCP server"
                ]
              }),
            },
          ],
        };
      } catch (error) {
        console.log("❌ ERROR: Connect-extension failed:", error);
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                success: false,
                error: (error as Error).message,
                message: "Failed to connect to MetaMask via bridge",
                relayUrl: bridgeServer?.getRelayUrl(),
                instructions: [
                  "1. Open the relay tab in your browser",
                  "2. Make sure MetaMask is installed and unlocked",
                  "3. Connect MetaMask in the relay tab",
                  "4. Try this command again"
                ]
              }),
            },
          ],
        };
      }
    },
  });
}

// Export function to stop bridge server (for cleanup)
export async function stopBridgeServer(): Promise<void> {
  if (bridgeServer && bridgeServer.isServerRunning()) {
    console.log("🔗 BRIDGE: Stopping bridge server...");
    await bridgeServer.stop();
    bridgeServer = null;
    console.log("✅ BRIDGE: Bridge server stopped");
  }
}

async function getMetaMaskConnectURI(log: any, wagmiConfig: Config, options?: MetaMaskParameters) {
  return new Promise((resolve, reject) => {
    const connectorFn = metaMask({
      headless: true,
      ...options,
    });
    const connector = wagmiConfig._internal.connectors.setup(connectorFn);
    connector.emitter.on("message", (payload) => {
      if (payload.type === "display_uri") {
        const uri = payload.data;
        resolve(uri);
      }
    });
    connector.emitter.on("connect", (payload) => {
      log.debug("connect success!", payload.accounts);
      resolve(payload.accounts);
    });
    connector.emitter.on("error", (payload) => {
      log.error(payload.error);
      reject(payload.error);
    });

    connect(wagmiConfig, { connector })
      .catch((error) => {
        log.error("connect error: ", error);
        log.error(error.stack);
        reject(error);
      });
  });
}
