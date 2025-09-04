import type { Config } from "@wagmi/core";
import type { FastMCP } from "fastmcp";
import { connect } from "@wagmi/core";
import { imageContent } from "fastmcp";
import QRCode from "qrcode";
import { z } from "zod";
import { metaMask, MetaMaskParameters } from "../connectors/metamask";
import { JSONStringify } from "../utils/json-stringify";
import { createBridgeClient } from "../wagmi-config";

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
    description: "Connect to the MetaMask browser extension via secure bridge.",
    parameters: z.object({}),
    execute: async (_, { log }) => {
      try {
        const bridgeClient = createBridgeClient();
        if (!bridgeClient) {
          return {
            content: [
              {
                type: "text",
                text: JSONStringify({
                  success: false,
                  error: "Bridge client creation failed",
                  message: "Please ensure the secure bridge server is running and the relay tab is open.",
                  instructions: [
                    "1. Start the bridge: node secure-bridge.js",
                    "2. Open relay tab: http://127.0.0.1:8546",
                    "3. Connect MetaMask in the relay tab",
                    "4. Try this command again"
                  ]
                }),
              },
            ],
          };
        }

        await bridgeClient.connect();
        const accounts = await bridgeClient.requestAccounts();
        bridgeClient.disconnect();
        
        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                success: true,
                message: "Successfully connected to MetaMask via secure bridge",
                accounts: accounts,
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
                success: false,
                error: (error as Error).message,
                message: "Failed to connect to MetaMask via bridge. Please ensure the relay tab is open and MetaMask is connected.",
              }),
            },
          ],
        };
      }
    },
  });
}

async function connectToMetaMaskExtension(log: any, wagmiConfig: Config) {
  return new Promise((resolve, reject) => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      reject(new Error("Browser extension connection requires a browser environment. This MCP server is running in a headless environment."));
      return;
    }

    // Check if MetaMask is installed
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      reject(new Error("MetaMask extension not found. Please install MetaMask browser extension."));
      return;
    }

    // Use the browser's ethereum provider directly
    window.ethereum.request({ method: 'eth_requestAccounts' })
      .then((accounts: string[]) => {
        log.debug("Extension connect success!", accounts);
        resolve(accounts);
      })
      .catch((error: any) => {
        log.error("Extension connect error:", error);
        if (error.code === 4001) {
          reject(new Error("User rejected the connection request"));
        } else {
          reject(error);
        }
      });
  });
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
