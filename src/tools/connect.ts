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
import open from "open";

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
    description: "Connect to the MetaMask browser extension via secure bridge. Automatically starts the bridge server and opens the relay tab in your browser.",
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

        // Create bridge client first to check connection
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
                    "1. The relay tab should have opened automatically in your browser",
                    "2. If not, open the relay tab manually using the URL above",
                    "3. Connect MetaMask in the relay tab",
                    "4. Try this command again"
                  ]
                }),
              },
            ],
          };
        }

        console.log("🔗 BRIDGE: Connecting to bridge...");
        await bridgeClient.connect();
        
        // Check if MetaMask is already connected
        console.log("🔍 CHECK: Checking if MetaMask is already connected...");
        let accounts = [];
        let wasBrowserOpened = false;
        
        try {
          accounts = await bridgeClient.getAccounts();
          console.log("🔍 CHECK: Found existing accounts:", accounts);
        } catch (error) {
          console.log("🔍 CHECK: No existing connection found:", error);
        }

        // Only open browser if not already connected
        if (accounts.length === 0) {
          console.log("🌐 BROWSER: No existing connection found, opening relay tab...");
          const relayUrl = bridgeServer?.getRelayUrl() || "http://127.0.0.1:8546";
          try {
            await open(relayUrl);
            console.log("✅ BROWSER: Relay tab opened successfully");
            wasBrowserOpened = true;
          } catch (error) {
            console.warn("⚠️ BROWSER: Could not open browser automatically:", error);
            console.log("📝 MANUAL: Please open the relay tab manually:", relayUrl);
          }
          
          // Now request accounts (this will trigger MetaMask popup)
          console.log("🔗 BRIDGE: Requesting accounts...");
          accounts = await bridgeClient.requestAccounts();
        } else {
          console.log("✅ CHECK: MetaMask already connected, skipping browser opening");
        }
        
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
                browserOpened: wasBrowserOpened,
                connectionStatus: wasBrowserOpened ? "Newly connected" : "Already connected",
                instructions: [
                  "The bridge server is now running automatically",
                  wasBrowserOpened ? "The relay tab was opened automatically in your browser" : "MetaMask was already connected, no browser opening needed",
                  "You can use the relay tab to monitor the connection",
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
                  "1. The relay tab should have opened automatically in your browser",
                  "2. If not, open the relay tab manually using the URL above",
                  "3. Make sure MetaMask is installed and unlocked",
                  "4. Connect MetaMask in the relay tab",
                  "5. Try this command again"
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
