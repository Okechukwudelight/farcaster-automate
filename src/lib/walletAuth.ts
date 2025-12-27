export type WalletProviderType = "metamask" | "coinbase";

export function getInjectedProvider(type: WalletProviderType): any | null {
  if (typeof window === "undefined") return null;

  const eth: any = (window as any).ethereum;
  if (!eth) return null;

  if (type === "coinbase") {
    if ((window as any).coinbaseWalletExtension) return (window as any).coinbaseWalletExtension;
    if (eth.isCoinbaseWallet) return eth;
    if (Array.isArray(eth.providers)) return eth.providers.find((p: any) => p.isCoinbaseWallet);
  }

  if (type === "metamask") {
    if (Array.isArray(eth.providers)) {
      return eth.providers.find((p: any) => p.isMetaMask && !p.isCoinbaseWallet);
    }
    if (eth.isMetaMask) return eth;
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
  const signature = await provider.request({
    method: "personal_sign",
    params: [message, address],
  });
  return signature as `0x${string}`;
}
