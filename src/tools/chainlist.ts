import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { getAllChains } from "../utils/chain-data";
import { JSONStringify } from "../utils/json-stringify";

export function registerChainlistTools(server: FastMCP): void {
  server.addTool({
    name: "get-chain-list",
    description: "Get a list of all chains information from ChainList.org.",
    parameters: z.object({}),
    execute: async () => {
      try {
        console.log("🚀 REQUEST: Fetching chain list from ChainList.org");
        const data = await getAllChains();
        console.log("✅ SUCCESS: Retrieved", data.length, "chains from ChainList.org");

        return {
          content: [
            {
              type: "text",
              text: JSONStringify({
                chains: data,
                count: data.length,
                source: "ChainList.org",
                url: "https://chainlist.org/rpcs.json"
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
                message: "Failed to fetch chain list from ChainList.org"
              }),
            },
          ],
        };
      }
    },
  });
};
