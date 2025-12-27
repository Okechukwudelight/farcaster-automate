import { useState, useCallback } from 'react';

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  chainId: number | null;
  error: string | null;
  walletType: 'metamask' | 'coinbase' | null;
}

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnecting: false,
    isConnected: false,
    chainId: null,
    error: null,
    walletType: null,
  });

  const getProvider = (type: 'metamask' | 'coinbase') => {
    if (type === 'coinbase') {
      // Check for Coinbase Wallet
      if ((window as any).coinbaseWalletExtension) {
        return (window as any).coinbaseWalletExtension;
      }
      // Coinbase Wallet can also be in ethereum provider
      if (window.ethereum?.isCoinbaseWallet) {
        return window.ethereum;
      }
      // Check providers array
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p: any) => p.isCoinbaseWallet);
      }
    }
    
    if (type === 'metamask') {
      // Check providers array first for MetaMask
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p: any) => p.isMetaMask && !p.isCoinbaseWallet);
      }
      if (window.ethereum?.isMetaMask) {
        return window.ethereum;
      }
    }
    
    // Fallback to default ethereum provider
    return window.ethereum;
  };

  const connect = useCallback(async (type: 'metamask' | 'coinbase' = 'metamask') => {
    const provider = getProvider(type);
    
    if (!provider) {
      const walletName = type === 'coinbase' ? 'Coinbase Wallet' : 'MetaMask';
      setState(prev => ({
        ...prev,
        error: `Please install ${walletName}`,
      }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const chainIdHex = await provider.request({ method: 'eth_chainId' });

      const address = accounts[0];
      const chainId = parseInt(chainIdHex, 16);

      setState({
        address,
        isConnecting: false,
        isConnected: true,
        chainId,
        error: null,
        walletType: type,
      });

      // Listen for account changes
      provider.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          setState({
            address: null,
            isConnecting: false,
            isConnected: false,
            chainId: null,
            error: null,
            walletType: null,
          });
        } else {
          setState(prev => ({ ...prev, address: accounts[0] }));
        }
      });

      // Listen for chain changes
      provider.on('chainChanged', (chainIdHex: string) => {
        setState(prev => ({ ...prev, chainId: parseInt(chainIdHex, 16) }));
      });

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect wallet',
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({
      address: null,
      isConnecting: false,
      isConnected: false,
      chainId: null,
      error: null,
      walletType: null,
    });
  }, []);

  const switchToBase = useCallback(async () => {
    const provider = state.walletType ? getProvider(state.walletType) : window.ethereum;
    if (!provider) return;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
      });
    } catch (error: any) {
      // Chain not added, try to add it
      if (error.code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
              chainName: 'Base',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org'],
            }],
          });
        } catch (addError) {
          console.error('Failed to add Base network:', addError);
        }
      }
    }
  }, [state.walletType]);

  const isOnBase = state.chainId === BASE_CHAIN_ID || state.chainId === BASE_SEPOLIA_CHAIN_ID;

  return {
    ...state,
    connect,
    disconnect,
    switchToBase,
    isOnBase,
  };
}

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
