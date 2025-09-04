#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";

const configPath = "bridge-config.json";

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.log("🔧 Update Bridge Token");
  console.log("=====================");
  console.log("");
  console.log("Usage: node update-bridge-token.js <token>");
  console.log("");
  console.log("Example:");
  console.log("  node update-bridge-token.js 74a436298f62ee3228c2d9b4c79b0d6122967512544a29aaa30045d760225b86");
  console.log("");
  console.log("To get the current token:");
  console.log("  node secure-bridge.js");
  console.log("  (Look for 'Auth token:' in the output)");
  process.exit(1);
}

try {
  // Read current config
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
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
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log("✅ Bridge token updated successfully!");
  console.log(`   Token: ${token}`);
  console.log("   Config file: bridge-config.json");
  console.log("");
  console.log("📋 Next steps:");
  console.log("   1. Start the bridge: node secure-bridge.js");
  console.log("   2. Open relay tab: http://127.0.0.1:8546");
  console.log("   3. Use your MCP server with Gemini CLI");

} catch (error) {
  console.error("❌ Error updating bridge token:", error.message);
  process.exit(1);
}
