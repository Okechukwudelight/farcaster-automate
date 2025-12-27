import { useState, useCallback } from 'react';
import { BrowserProvider } from 'ethers';

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  chainId: number | null;
  error: string | null;
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
  });

  const connect = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      setState(prev => ({
        ...prev,
        error: 'Please install MetaMask or another Web3 wallet',
      }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();

      const address = accounts[0];
      const chainId = Number(network.chainId);

      setState({
        address,
        isConnecting: false,
        isConnected: true,
        chainId,
        error: null,
      });

      // Listen for account changes
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          setState({
            address: null,
            isConnecting: false,
            isConnected: false,
            chainId: null,
            error: null,
          });
        } else {
          setState(prev => ({ ...prev, address: accounts[0] }));
        }
      });

      // Listen for chain changes
      window.ethereum.on('chainChanged', (chainIdHex: string) => {
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
    });
  }, []);

  const switchToBase = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
      });
    } catch (error: any) {
      // Chain not added, try to add it
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
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
  }, []);

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
