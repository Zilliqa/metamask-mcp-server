// Shared utility for fetching chain data from ChainList.org

export interface ChainInfo {
  decimals: number;
  symbol: string;
  name: string;
}

// Special cases where ChainList data might be incorrect
const specialCases: Record<number, ChainInfo> = {
  // Add special cases here only when ChainList data is actually wrong
  // Zilliqa uses 18 decimals (same as ChainList), so no special case needed
};

/**
 * Fetches all chain data from ChainList.org
 */
export async function fetchChainListData(): Promise<any[]> {
  const url = "https://chainlist.org/rpcs.json";
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch chain list: ${response.status}`);
  }

  return await response.json();
}

/**
 * Gets chain information for a specific chain ID
 * @param chainId - The chain ID to get information for
 * @returns Chain information including decimals, symbol, and name
 */
export async function getChainInfo(chainId: number): Promise<ChainInfo> {
  // Check special cases first
  if (specialCases[chainId]) {
    console.log(`🔧 Using special case for chain ${chainId}:`, specialCases[chainId]);
    return specialCases[chainId];
  }

  try {
    const chainListData = await fetchChainListData();

    // Find the chain by ID
    const chain = chainListData.find((c: any) => c.chainId === chainId);

    if (chain) {
      const chainInfo: ChainInfo = {
        decimals: chain.nativeCurrency?.decimals || 18,
        symbol: chain.nativeCurrency?.symbol || "ETH",
        name: chain.name || `Chain ${chainId}`
      };
      console.log(`📡 ChainList data for ${chainId}:`, chainInfo);
      return chainInfo;
    }

    // Fallback for unknown chains
    console.warn(`Chain ID ${chainId} not found in ChainList, using default values`);
    return {
      decimals: 18,
      symbol: "ETH",
      name: `Unknown Chain ${chainId}`
    };
  } catch (error) {
    console.warn(`Failed to fetch chain info for ${chainId}:`, error);
    // Fallback to default values
    return {
      decimals: 18,
      symbol: "ETH",
      name: `Chain ${chainId}`
    };
  }
}

/**
 * Gets all available chains from ChainList.org
 * @returns Array of all chains
 */
export async function getAllChains(): Promise<any[]> {
  try {
    return await fetchChainListData();
  } catch (error) {
    console.warn("Failed to fetch all chains:", error);
    return [];
  }
}
