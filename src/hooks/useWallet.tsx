import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import EthereumProvider from "@walletconnect/ethereum-provider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type WalletType = "metamask" | "coinbase" | "walletconnect";

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  chainId: number | null;
  error: string | null;
  walletType: WalletType | null;
}

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

// WalletConnect Project ID - ideally provided via VITE_WALLETCONNECT_PROJECT_ID
const FALLBACK_WALLETCONNECT_PROJECT_ID = "3fcc0f2c1c8f1c8b8c8b8c8f1c8f1c8b";

const isMobile = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

const isAndroid = () => /Android/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

const getMobileWalletUrl = (type: "metamask" | "coinbase") => {
  const currentUrl = window.location.href;
  const strippedUrl = currentUrl.replace(/^https?:\/\//, "");

  if (type === "metamask") {
    if (isAndroid()) {
      return `intent://dapp/${strippedUrl}#Intent;scheme=metamask;package=io.metamask;end`;
    }
    return `metamask://dapp/${strippedUrl}`;
  }

  if (type === "coinbase") {
    if (isAndroid()) {
      return `intent://dapp?url=${encodeURIComponent(currentUrl)}#Intent;scheme=cbwallet;package=org.toshi;end`;
    }
    return `cbwallet://dapp?url=${encodeURIComponent(currentUrl)}`;
  }

  return null;
};

const isInWalletBrowser = () => {
  const ua = navigator.userAgent.toLowerCase();
  const hasWalletUA =
    ua.includes("metamask") ||
    ua.includes("coinbase") ||
    ua.includes("trust") ||
    ua.includes("rainbow");
  const hasInjectedProvider = typeof window !== "undefined" && !!window.ethereum;
  return hasWalletUA || (isMobile() && hasInjectedProvider);
};

const getProvider = (type: "metamask" | "coinbase") => {
  if (type === "coinbase") {
    if ((window as any).coinbaseWalletExtension) return (window as any).coinbaseWalletExtension;
    if (window.ethereum?.isCoinbaseWallet) return window.ethereum;
    if (window.ethereum?.providers) {
      return window.ethereum.providers.find((p: any) => p.isCoinbaseWallet);
    }
  }

  if (type === "metamask") {
    if (window.ethereum?.providers) {
      return window.ethereum.providers.find((p: any) => p.isMetaMask && !p.isCoinbaseWallet);
    }
    if (window.ethereum?.isMetaMask) return window.ethereum;
  }

  return window.ethereum;
};

const inferWalletTypeFromProvider = (provider: any): WalletType | null => {
  if (!provider) return null;
  if (provider.isCoinbaseWallet) return "coinbase";
  if (provider.isMetaMask) return "metamask";
  return null;
};

type WalletContextValue = WalletState & {
  connect: (type?: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  switchToBase: () => Promise<void>;
  isOnBase: boolean;
  loadWallet: () => Promise<void>;
  isMobile: boolean;
  isInWalletBrowser: boolean;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function useProvideWallet(): WalletContextValue {
  const { user: authUser } = useAuth();
  const wcProviderRef = useRef<any>(null);

  const [state, setState] = useState<WalletState>({
    address: null,
    isConnecting: false,
    isConnected: false,
    chainId: null,
    error: null,
    walletType: null,
  });

  const isOnBase = state.chainId === BASE_CHAIN_ID || state.chainId === BASE_SEPOLIA_CHAIN_ID;

  const saveWalletToDatabase = useCallback(async (userId: string, address: string) => {
    try {
      const { error: dbError } = await supabase
        .from("user_connections")
        .upsert({ user_id: userId, wallet_address: address }, { onConflict: "user_id" });

      if (dbError) {
        // keep quiet in UI; surface only if needed
        console.error("Error saving wallet address:", dbError);
        return;
      }

      window.dispatchEvent(new CustomEvent("wallet-connected"));
    } catch (error) {
      console.error("Error saving wallet to database:", error);
    }
  }, []);

  const setupEventListeners = useCallback(
    (provider: any, walletType: WalletType) => {
      const handleAccountsChanged = (accounts: string[]) => {
        if (!accounts || accounts.length === 0) {
          setState({
            address: null,
            isConnecting: false,
            isConnected: false,
            chainId: null,
            error: null,
            walletType: null,
          });

          if (authUser) {
            supabase.from("user_connections").update({ wallet_address: null }).eq("user_id", authUser.id);
          }
          return;
        }

        const newAddress = accounts[0];
        setState((prev) => ({ ...prev, address: newAddress }));

        if (authUser) {
          supabase
            .from("user_connections")
            .upsert({ user_id: authUser.id, wallet_address: newAddress }, { onConflict: "user_id" });
        }
      };

      const handleChainChanged = (chainIdHex: string | number) => {
        const chainId = typeof chainIdHex === "string" ? parseInt(chainIdHex, 16) : chainIdHex;
        setState((prev) => ({ ...prev, chainId }));
      };

      const handleDisconnect = () => {
        setState({
          address: null,
          isConnecting: false,
          isConnected: false,
          chainId: null,
          error: null,
          walletType: null,
        });
      };

      if (provider && typeof provider.on === "function") {
        provider.on("accountsChanged", handleAccountsChanged);
        provider.on("chainChanged", handleChainChanged);
        if (walletType === "walletconnect") provider.on("disconnect", handleDisconnect);
      }
    },
    [authUser],
  );

  const connectWalletConnect = useCallback(async () => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const projectId =
        (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID || FALLBACK_WALLETCONNECT_PROJECT_ID;

      const provider = await EthereumProvider.init({
        projectId,
        chains: [BASE_CHAIN_ID],
        optionalChains: [1, BASE_SEPOLIA_CHAIN_ID],
        showQrModal: true,
        metadata: {
          name: "Base Remittance",
          description: "Send stablecoins on Base network",
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.ico`],
        },
      });

      wcProviderRef.current = provider;

      await provider.connect();

      const accounts = provider.accounts || [];
      const chainId = provider.chainId ?? null;

      if (!accounts.length) throw new Error("No accounts returned");

      const address = accounts[0];

      localStorage.setItem("lastWalletType", "walletconnect");

      setState({
        address,
        isConnecting: false,
        isConnected: true,
        chainId,
        error: null,
        walletType: "walletconnect",
      });

      if (authUser) await saveWalletToDatabase(authUser.id, address);

      setupEventListeners(provider, "walletconnect");
    } catch (error: any) {
      console.error("WalletConnect error:", error);
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: error?.message || "Failed to connect with WalletConnect",
      }));
    }
  }, [authUser, saveWalletToDatabase, setupEventListeners]);

  const connect = useCallback(
    async (type: WalletType = "metamask") => {
      if (type === "walletconnect") return connectWalletConnect();

      setState((prev) => ({ ...prev, isConnecting: true, error: null }));

      // Check if we have any provider at all
      const provider = getProvider(type) || window.ethereum;

      if (!provider) {
        // No extension available - on mobile, deep link; on desktop, show error
        if (isMobile()) {
          const mobileUrl = getMobileWalletUrl(type);
          if (mobileUrl) {
            setState((prev) => ({ ...prev, isConnecting: false }));
            window.location.href = mobileUrl;
            return;
          }
        }

        const walletName = type === "coinbase" ? "Coinbase Wallet" : "MetaMask";
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: `${walletName} not detected. Please install the extension or use WalletConnect.`,
        }));
        return;
      }

      // Provider exists, try to connect
      try {
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        const chainIdHex = await provider.request({ method: "eth_chainId" });

        const address = accounts?.[0] ?? null;
        const chainId = chainIdHex ? parseInt(chainIdHex, 16) : null;

        if (!address) throw new Error("No account selected");

        localStorage.setItem("lastWalletType", type);
        localStorage.setItem("lastWalletAddress", address);

        setState({
          address,
          isConnecting: false,
          isConnected: true,
          chainId,
          error: null,
          walletType: type,
        });

        if (authUser) await saveWalletToDatabase(authUser.id, address);

        setupEventListeners(provider, type);
      } catch (error: any) {
        console.error("Wallet connect error:", error);
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: error?.message || "Failed to connect wallet",
        }));
      }
    },
    [authUser, connectWalletConnect, saveWalletToDatabase, setupEventListeners],
  );

  const disconnect = useCallback(async () => {
    if (state.walletType === "walletconnect" && wcProviderRef.current) {
      try {
        await wcProviderRef.current.disconnect();
      } catch (error) {
        console.error("Error disconnecting WalletConnect:", error);
      }
      wcProviderRef.current = null;
    }

    if (authUser) {
      try {
        await supabase.from("user_connections").update({ wallet_address: null }).eq("user_id", authUser.id);
      } catch (error) {
        console.error("Error clearing wallet from database:", error);
      }
    }

    localStorage.removeItem("lastWalletAddress");

    setState({
      address: null,
      isConnecting: false,
      isConnected: false,
      chainId: null,
      error: null,
      walletType: null,
    });
  }, [authUser, state.walletType]);

  const attemptInjectedAutoReconnect = useCallback(async () => {
    if (!window.ethereum) return false;

    const savedWalletType = (localStorage.getItem("lastWalletType") as WalletType | null) ?? null;
    const preferred = savedWalletType && savedWalletType !== "walletconnect" ? savedWalletType : "metamask";
    const provider = getProvider(preferred) || window.ethereum;

    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) return false;

      const chainIdHex = await provider.request({ method: "eth_chainId" });
      const chainId = chainIdHex ? parseInt(chainIdHex, 16) : null;

      // Infer type from provider flags (or fall back to preferred)
      const inferredType = inferWalletTypeFromProvider(provider) || preferred;

      const address = accounts[0];

      setState({
        address,
        isConnecting: false,
        isConnected: true,
        chainId,
        error: null,
        walletType: inferredType,
      });

      localStorage.setItem("lastWalletType", inferredType);
      localStorage.setItem("lastWalletAddress", address);

      if (authUser) await saveWalletToDatabase(authUser.id, address);

      setupEventListeners(provider, inferredType);
      return true;
    } catch {
      return false;
    }
  }, [authUser, saveWalletToDatabase, setupEventListeners]);

  const loadWallet = useCallback(async () => {
    // 1) First try to rehydrate from the wallet itself (works on refresh + route changes)
    const rehydrated = await attemptInjectedAutoReconnect();
    if (rehydrated) return;

    // 2) Fallback: if logged in, keep DB in sync (does not auto-connect wallet)
    if (!authUser) return;

    try {
      const { data, error } = await supabase
        .from("user_connections")
        .select("wallet_address")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (error) throw error;

      // If DB has a wallet but wallet isn't connected right now, don't show as connected.
      if (data?.wallet_address) {
        setState((prev) => ({
          ...prev,
          isConnected: false,
          address: null,
        }));
      }
    } catch (error) {
      console.error("Failed to load wallet connection:", error);
    }
  }, [attemptInjectedAutoReconnect, authUser]);

  // Auto-reconnect once on app start / auth changes
  useEffect(() => {
    void loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  const switchToBase = useCallback(async () => {
    let provider: any;

    if (state.walletType === "walletconnect" && wcProviderRef.current) {
      provider = wcProviderRef.current;
    } else if (state.walletType === "metamask" || state.walletType === "coinbase") {
      provider = getProvider(state.walletType);
    } else {
      provider = window.ethereum;
    }

    if (!provider) return;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
      });
    } catch (error: any) {
      if (error?.code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
                chainName: "Base",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://mainnet.base.org"],
                blockExplorerUrls: ["https://basescan.org"],
              },
            ],
          });
        } catch (addError) {
          console.error("Failed to add Base network:", addError);
        }
      }
    }
  }, [state.walletType]);

  const value: WalletContextValue = useMemo(
    () => ({
      ...state,
      connect,
      disconnect,
      switchToBase,
      isOnBase,
      loadWallet,
      isMobile: isMobile(),
      isInWalletBrowser: isInWalletBrowser(),
    }),
    [connect, disconnect, isOnBase, loadWallet, state, switchToBase],
  );

  return value;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideWallet();
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
