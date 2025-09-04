#!/usr/bin/env node

import express from "express";
import { WebSocketServer } from "ws";
import crypto from "crypto";
import { createServer } from "http";
import { readFileSync, writeFileSync } from "fs";

const PORT = 8546;
const TOKEN = crypto.randomBytes(32).toString("hex"); // session token
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

// Function to update bridge config file
function updateBridgeConfig(token) {
  try {
    // Read current config or create default
    let config;
    try {
      config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch (error) {
      // Create default config if file doesn't exist
      config = {
        "token": "default-token",
        "bridgeUrl": "ws://127.0.0.1:8546",
        "enabled": true
      };
    }

    // Update token
    config.token = token;

    // Write updated config
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    
    console.log("✅ Bridge config updated automatically");
    console.log(`   Config file: ${CONFIG_PATH}`);
  } catch (error) {
    console.warn("⚠️  Warning: Could not update bridge config:", error.message);
  }
}

console.log("== MetaMask Secure Bridge ==");
console.log("Auth token:", TOKEN);
console.log("Allowed methods:", ALLOWED_METHODS.join(", "));

// Update the config file with the new token
updateBridgeConfig(TOKEN);

const app = express();
const server = createServer(app);

// Enable CORS for the relay tab
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Serve the relay tab
app.get("/", (req, res) => {
  res.send(`
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
    Bridge Token: ${TOKEN}
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
  `);
});

// Start HTTP server
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`Relay tab: http://127.0.0.1:${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

let browserClient = null;
const requestLog = [];
const activeRequests = new Map();

// Clean up old requests every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of activeRequests.entries()) {
    if (now - timestamp > 300000) { // 5 minutes
      activeRequests.delete(id);
    }
  }
}, 300000);

wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`Client connected from ${clientIP}`);
  
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      
      // Log all requests
      requestLog.push({
        timestamp: new Date().toISOString(),
        clientIP,
        data: { ...data, token: data.token ? "***" : undefined }
      });
      
      // Keep only last 100 requests
      if (requestLog.length > 100) {
        requestLog.shift();
      }
      
      // Handle browser registration
      if (data.type === "register" && data.role === "browser") {
        browserClient = ws;
        ws.send(JSON.stringify({ ok: true, msg: "Browser registered" }));
        console.log("Browser relay registered");
        return;
      }
      
      // Validate authentication
      if (!data.token || data.token !== TOKEN) {
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
        if (activeRequests.has(data.nonce)) {
          ws.send(JSON.stringify({ error: "Nonce already used" }));
          console.log("Replay attack detected");
          return;
        }
        activeRequests.set(data.nonce, Date.now());
      }
      
      // Check if browser relay is available
      if (!browserClient || browserClient.readyState !== ws.OPEN) {
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
      browserClient.send(JSON.stringify({
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
    if (ws === browserClient) {
      browserClient = null;
      console.log("Browser relay disconnected");
    }
  });
  
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

// Handle responses from browser
wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      
      // Handle responses from browser
      if (data.id && (data.result || data.error)) {
        // Find the original client and send response
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
        
        // Clear timeout if it exists
        if (data.timeout) {
          clearTimeout(data.timeout);
        }
        
        console.log(`Response sent for request ID: ${data.id}`);
      }
    } catch (err) {
      console.error("Error processing browser response:", err);
    }
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down bridge server...');
  wss.close(() => {
    server.close(() => {
      console.log('Bridge server closed');
      process.exit(0);
    });
  });
});

console.log("Bridge server started successfully");
