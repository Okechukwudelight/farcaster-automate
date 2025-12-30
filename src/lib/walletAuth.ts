export type WalletProviderType = "core" | "coinbase";

export function getInjectedProvider(type: WalletProviderType): any | null {
  if (typeof window === "undefined") return null;

  const eth: any = (window as any).ethereum;
  if (!eth) return null;

  if (type === "coinbase") {
    if ((window as any).coinbaseWalletExtension) return (window as any).coinbaseWalletExtension;
    if (eth.isCoinbaseWallet) return eth;
    if (Array.isArray(eth.providers)) return eth.providers.find((p: any) => p.isCoinbaseWallet);
  }

  if (type === "core") {
    // Core Wallet (Avalanche) - check for Core-specific provider
    if ((window as any).avalanche) return (window as any).avalanche;
    if (eth.isAvalanche || eth.isCore) return eth;
    if (Array.isArray(eth.providers)) {
      return eth.providers.find((p: any) => p.isAvalanche || p.isCore);
    }
    // Fallback to default ethereum provider
    if (!eth.isCoinbaseWallet) return eth;
  }

  return eth;
}

export async function requestWalletAddress(provider: any): Promise<string> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0];
  if (!address) throw new Error("No wallet account selected");
  return address;
}

export async function personalSign(provider: any, address: string, message: string): Promise<`0x${string}`> {
  // Ensure address has 0x prefix and is lowercase
  const normalizedAddress = address.startsWith('0x') 
    ? address.toLowerCase() 
    : `0x${address.toLowerCase()}`;

  try {
    // Try with plain message first (standard EIP-191 format)
    // Most wallets accept plain string messages
    const signature = await provider.request({
      method: "personal_sign",
      params: [message, normalizedAddress],
    });
    
    // Ensure signature has 0x prefix
    if (typeof signature === 'string') {
      return signature.startsWith('0x') 
        ? signature as `0x${string}`
        : `0x${signature}` as `0x${string}`;
    }
    
    return signature as `0x${string}`;
  } catch (error: any) {
    // If plain message fails, try hex-encoded message
    if (error.message?.includes('hex') || error.message?.includes('0x')) {
      console.log('Plain message failed, trying hex-encoded message...');
      const messageHex = '0x' + Array.from(message)
        .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
      
      const signature = await provider.request({
        method: "personal_sign",
        params: [messageHex, normalizedAddress],
      });
      
      if (typeof signature === 'string') {
        return signature.startsWith('0x') 
          ? signature as `0x${string}`
          : `0x${signature}` as `0x${string}`;
      }
      
      return signature as `0x${string}`;
    }
    throw error;
  }
}
