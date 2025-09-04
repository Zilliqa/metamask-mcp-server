import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { readFileSync } from "fs";
import { join } from "path";

export interface BridgeRequest {
  id: string;
  token: string;
  method: string;
  params: any[];
  nonce?: string;
}

export interface BridgeResponse {
  id: string;
  result?: any;
  error?: string;
}

export class MetaMaskBridgeClient {
  private ws: WebSocket | null = null;
  private token: string;
  private bridgeUrl: string;
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private isConnected = false;

  constructor(token?: string, bridgeUrl?: string) {
    // Load configuration from file or use provided values
    try {
      const configPath = join(process.cwd(), "bridge-config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      
      this.token = token || config.token || "default-token";
      this.bridgeUrl = bridgeUrl || config.bridgeUrl || "ws://127.0.0.1:8546";
      
      if (this.token === "default-token") {
        console.warn("⚠️  Using default bridge token. Update bridge-config.json with the correct token.");
      }
    } catch (error) {
      // Fallback to environment variables or defaults
      this.token = token || process.env.METAMASK_TOKEN || "default-token";
      this.bridgeUrl = bridgeUrl || "ws://127.0.0.1:8546";
      
      if (this.token === "default-token") {
        console.warn("⚠️  Using default bridge token. Set METAMASK_TOKEN environment variable or update bridge-config.json");
      }
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.bridgeUrl);
        
        this.ws.on("open", () => {
          console.log("Connected to MetaMask bridge");
          this.isConnected = true;
          resolve();
        });

        this.ws.on("message", (data: Buffer) => {
          try {
            const response: BridgeResponse = JSON.parse(data.toString());
            this.handleResponse(response);
          } catch (error) {
            console.error("Error parsing bridge response:", error);
          }
        });

        this.ws.on("close", () => {
          console.log("Disconnected from MetaMask bridge");
          this.isConnected = false;
          // Reject all pending requests
          for (const [id, { reject }] of this.pendingRequests) {
            reject(new Error("Bridge connection closed"));
          }
          this.pendingRequests.clear();
        });

        this.ws.on("error", (error) => {
          console.error("Bridge WebSocket error:", error);
          this.isConnected = false;
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error("Connection timeout"));
          }
        }, 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleResponse(response: BridgeResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);
      
      if (response.error) {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response.result);
      }
    }
  }

  async request(method: string, params: any[] = []): Promise<any> {
    if (!this.isConnected || !this.ws) {
      throw new Error("Not connected to bridge");
    }

    const id = uuidv4();
    const nonce = uuidv4(); // Anti-replay protection

    const request: BridgeRequest = {
      id,
      token: this.token,
      method,
      params,
      nonce
    };

    // console.log("📤 Bridge client sending request:", { method, params, token: this.token.substring(0, 20) + "..." });

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }, 30000); // 30 second timeout

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request
      this.ws!.send(JSON.stringify(request));
    });
  }

  async signMessage(message: string, address: string): Promise<string> {
    return this.request("personal_sign", [message, address]);
  }

  async sendTransaction(transaction: any): Promise<string> {
    // console.log("🔗 Bridge client sending transaction:", transaction);
    const result = await this.request("eth_sendTransaction", [transaction]);
    // console.log("✅ Bridge client received result:", result);
    return result;
  }

  async signTypedData(data: any, address: string): Promise<string> {
    return this.request("eth_signTypedData_v4", [address, data]);
  }

  async requestAccounts(): Promise<string[]> {
    return this.request("eth_requestAccounts");
  }

  async getAccounts(): Promise<string[]> {
    return this.request("eth_accounts");
  }

  async getChainId(): Promise<string> {
    return this.request("eth_chainId");
  }

  async getBalance(address: string, blockTag: string = "latest"): Promise<string> {
    return this.request("eth_getBalance", [address, blockTag]);
  }

  async call(transaction: any, blockTag: string = "latest"): Promise<string> {
    return this.request("eth_call", [transaction, blockTag]);
  }

  async estimateGas(transaction: any): Promise<string> {
    return this.request("eth_estimateGas", [transaction]);
  }

  async getPermissions(): Promise<any> {
    return this.request("wallet_getPermissions", []);
  }

  async requestPermissions(permissions: any): Promise<any> {
    return this.request("wallet_requestPermissions", [permissions]);
  }

  async switchEthereumChain(chainId: string): Promise<any> {
    return this.request("wallet_switchEthereumChain", [{ chainId }]);
  }

  async addEthereumChain(chainParams: any): Promise<any> {
    return this.request("wallet_addEthereumChain", [chainParams]);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  isBridgeConnected(): boolean {
    return this.isConnected;
  }
}
