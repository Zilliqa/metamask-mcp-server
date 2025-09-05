import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import express from 'express';
import crypto from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const PORT = 8546;
const CONFIG_PATH = "bridge-config.json";
const ALLOWED_METHODS = [
  "personal_sign",
  "eth_sendTransaction", 
  "eth_signTypedData_v4",
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "eth_getBalance",
  "eth_call",
  "eth_estimateGas",
  "wallet_getPermissions",
  "wallet_requestPermissions",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain"
];

export class BridgeServer {
  private server: any;
  private wss: WebSocketServer;
  private app: express.Application;
  private token: string;
  private browserClient: any = null;
  private activeRequests = new Map();
  private isRunning = false;

  constructor() {
    this.token = crypto.randomBytes(32).toString('hex');
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.updateBridgeConfig();
  }

  private setupMiddleware() {
    // Enable CORS for the relay tab
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
  }

  private setupRoutes() {
    // Serve the relay tab
    this.app.get("/", (req, res) => {
      res.send(this.getRelayTabHTML());
    });
  }

  private getRelayTabHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>MetaMask Relay</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
    .connected { background-color: #d4edda; color: #155724; }
    .disconnected { background-color: #f8d7da; color: #721c24; }
    .log { background-color: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>🔗 MetaMask Relay</h1>
  <div id="token" class="status" style="background-color: #e2e3e5; color: #383d41; font-family: monospace; font-size: 12px;">
    Bridge Token: ${this.token}
  </div>
  <div id="status" class="status disconnected">Connecting to bridge...</div>
  <div id="log" class="log"></div>
  
  <script>
    const ws = new WebSocket("ws://127.0.0.1:${PORT}");
    const status = document.getElementById('status');
    const log = document.getElementById('log');
    
    function addLog(message) {
      const time = new Date().toLocaleTimeString();
      log.innerHTML += \`[\${time}] \${message}\\n\`;
      log.scrollTop = log.scrollHeight;
    }
    
    ws.onopen = () => {
      status.textContent = "Connected to bridge";
      status.className = "status connected";
      ws.send(JSON.stringify({ type: "register", role: "browser" }));
      addLog("Registered as browser relay");
    };
    
    ws.onclose = () => {
      status.textContent = "Disconnected from bridge";
      status.className = "status disconnected";
      addLog("Connection closed");
    };
    
    ws.onerror = (error) => {
      addLog("WebSocket error: " + error.message);
    };
    
    ws.onmessage = async (event) => {
      const req = JSON.parse(event.data);
      if (!req.method) return;
      
      addLog(\`Received request: \${req.method}\`);
      
      try {
        if (!window.ethereum) {
          throw new Error("MetaMask not found");
        }
        
        const result = await window.ethereum.request({
          method: req.method,
          params: req.params
        });
        
        ws.send(JSON.stringify({ id: req.id, result }));
        addLog(\`Sent result for \${req.method}\`);
      } catch (err) {
        ws.send(JSON.stringify({ id: req.id, error: err.message }));
        addLog(\`Error for \${req.method}: \${err.message}\`);
      }
    };
  </script>
</body>
</html>
    `;
  }

  private updateBridgeConfig() {
    try {
      let config;
      try {
        config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      } catch (error) {
        config = {
          "token": "default-token",
          "bridgeUrl": "ws://127.0.0.1:8546",
          "enabled": true
        };
      }

      config.token = this.token;
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      
      console.log("✅ Bridge config updated automatically");
    } catch (error) {
      console.warn("⚠️  Warning: Could not update bridge config:", error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Bridge server is already running");
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.app);
        
        // Start HTTP server
        this.server.listen(PORT, "127.0.0.1", () => {
          console.log(`Bridge listening on http://127.0.0.1:${PORT}`);
          console.log(`Relay tab: http://127.0.0.1:${PORT}`);
          this.isRunning = true;
          resolve();
        });

        // WebSocket server
        this.wss = new WebSocketServer({ server: this.server });
        this.setupWebSocketHandlers();

        // Clean up old requests every 5 minutes
        setInterval(() => {
          const now = Date.now();
          for (const [id, timestamp] of this.activeRequests.entries()) {
            if (now - timestamp > 300000) { // 5 minutes
              this.activeRequests.delete(id);
            }
          }
        }, 300000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private setupWebSocketHandlers() {
    this.wss.on("connection", (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      console.log(`Client connected from ${clientIP}`);
      
      ws.on("message", (msg) => {
        try {
          const data = JSON.parse(msg);
          
          // Handle browser registration
          if (data.type === "register" && data.role === "browser") {
            this.browserClient = ws;
            ws.send(JSON.stringify({ ok: true, msg: "Browser registered" }));
            console.log("Browser relay registered");
            return;
          }
          
          // Validate authentication
          if (!data.token || data.token !== this.token) {
            ws.send(JSON.stringify({ error: "Invalid token" }));
            console.log("Invalid token from client");
            return;
          }
          
          // Validate method is allowed
          if (!ALLOWED_METHODS.includes(data.method)) {
            ws.send(JSON.stringify({ error: "Method not allowed" }));
            console.log(`Method not allowed: ${data.method}`);
            return;
          }
          
          // Check for replay attacks (nonce validation)
          if (data.nonce) {
            if (this.activeRequests.has(data.nonce)) {
              ws.send(JSON.stringify({ error: "Nonce already used" }));
              console.log("Replay attack detected");
              return;
            }
            this.activeRequests.set(data.nonce, Date.now());
          }
          
          // Check if browser relay is available
          if (!this.browserClient || this.browserClient.readyState !== ws.OPEN) {
            ws.send(JSON.stringify({ error: "No browser relay connected" }));
            console.log("No browser relay available");
            return;
          }
          
          // Set timeout for request
          const timeout = setTimeout(() => {
            ws.send(JSON.stringify({ 
              id: data.id, 
              error: "Request timeout - MetaMask did not respond" 
            }));
            console.log(`Request timeout: ${data.method}`);
          }, 30000); // 30 second timeout
          
          // Forward request to browser (without timeout object)
          this.browserClient.send(JSON.stringify({
            id: data.id,
            method: data.method,
            params: data.params
          }));
          
          console.log(`Forwarded request: ${data.method} (ID: ${data.id})`);
          
        } catch (err) {
          ws.send(JSON.stringify({ error: err.message }));
          console.error("Error processing message:", err);
        }
      });
      
      ws.on("close", () => {
        if (ws === this.browserClient) {
          this.browserClient = null;
          console.log("Browser relay disconnected");
        }
      });
      
      ws.on("error", (err) => {
        console.error("WebSocket error:", err);
      });
    });

    // Handle responses from browser
    this.wss.on("connection", (ws) => {
      ws.on("message", (msg) => {
        try {
          const data = JSON.parse(msg);
          
          // Handle responses from browser
          if (data.id && (data.result || data.error)) {
            // Find the original client and send response
            this.wss.clients.forEach(client => {
              if (client !== ws && client.readyState === ws.OPEN) {
                client.send(JSON.stringify(data));
              }
            });
            
            console.log(`Response sent for request ID: ${data.id}`);
          }
        } catch (err) {
          console.error("Error processing browser response:", err);
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          console.log('Bridge server closed');
          this.isRunning = false;
          resolve();
        });
      });
    });
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  getToken(): string {
    return this.token;
  }

  getRelayUrl(): string {
    return `http://127.0.0.1:${PORT}`;
  }
}
