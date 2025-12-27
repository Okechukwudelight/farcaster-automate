import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
  const { user: authUser } = useAuth();
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

      // Save to database if user is authenticated
      if (authUser) {
        try {
          const { error: dbError } = await supabase
            .from('user_connections')
            .upsert(
              {
                user_id: authUser.id,
                wallet_address: address,
              },
              { onConflict: 'user_id' },
            );

          if (dbError) {
            console.error('Error saving wallet address:', dbError);
          } else {
            console.log('Wallet address saved successfully');
            // Dispatch event to trigger UI update
            window.dispatchEvent(new CustomEvent('wallet-connected'));
          }
        } catch (error) {
          console.error('Error saving wallet to database:', error);
        }
      }

      // Listen for account changes - check if provider supports events
      // Handle account changes
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setState({
            address: null,
            isConnecting: false,
            isConnected: false,
            chainId: null,
            error: null,
            walletType: null,
          });
          // Clear from database
          if (authUser) {
            supabase
              .from('user_connections')
              .update({ wallet_address: null })
              .eq('user_id', authUser.id);
          }
        } else {
          const newAddress = accounts[0];
          setState(prev => ({ ...prev, address: newAddress }));
          // Update database
          if (authUser) {
            supabase
              .from('user_connections')
              .upsert(
                {
                  user_id: authUser.id,
                  wallet_address: newAddress,
                },
                { onConflict: 'user_id' },
              );
          }
        }
      };

      // Handle chain changes
      const handleChainChanged = (chainIdHex: string) => {
        setState(prev => ({ ...prev, chainId: parseInt(chainIdHex, 16) }));
      };

      // Try different event listener methods
      if (provider && typeof provider.on === 'function') {
        // Standard EIP-1193 provider
        provider.on('accountsChanged', handleAccountsChanged);
        provider.on('chainChanged', handleChainChanged);
      } else if (provider && typeof provider.addEventListener === 'function') {
        // Some providers use addEventListener
        provider.addEventListener('accountsChanged', handleAccountsChanged);
        provider.addEventListener('chainChanged', handleChainChanged);
      } else if (provider && window.ethereum) {
        // Fallback: use window.ethereum directly if available
        if (typeof window.ethereum.on === 'function') {
          window.ethereum.on('accountsChanged', handleAccountsChanged);
          window.ethereum.on('chainChanged', handleChainChanged);
        }
      }

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect wallet',
      }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    // Clear from database
    if (authUser) {
      try {
        await supabase
          .from('user_connections')
          .update({ wallet_address: null })
          .eq('user_id', authUser.id);
      } catch (error) {
        console.error('Error clearing wallet from database:', error);
      }
    }

    setState({
      address: null,
      isConnecting: false,
      isConnected: false,
      chainId: null,
      error: null,
      walletType: null,
    });
  }, [authUser]);

  const loadWallet = useCallback(async () => {
    if (!authUser) return;

    try {
      const { data, error } = await supabase
        .from('user_connections')
        .select('wallet_address')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.wallet_address) {
        // Check if wallet is still connected - try both wallet types
        let provider = getProvider('metamask');
        let walletType: 'metamask' | 'coinbase' = 'metamask';
        
        if (!provider) {
          provider = getProvider('coinbase');
          walletType = 'coinbase';
        }

        if (provider) {
          try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            const chainIdHex = await provider.request({ method: 'eth_chainId' });

            if (accounts.length > 0 && accounts[0].toLowerCase() === data.wallet_address.toLowerCase()) {
              // Wallet is still connected
              setState({
                address: accounts[0],
                isConnecting: false,
                isConnected: true,
                chainId: parseInt(chainIdHex, 16),
                error: null,
                walletType,
              });
            } else {
              // Address doesn't match or wallet disconnected
              setState(prev => ({
                ...prev,
                address: null,
                isConnected: false,
              }));
            }
          } catch (error) {
            // Provider not available or error checking
            console.log('Wallet not available:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load wallet connection:', error);
    }
  }, [authUser]);

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
    loadWallet,
  };
}

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
