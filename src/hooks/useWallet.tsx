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

// Detect if user is on mobile
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Get the current URL for deep linking
const getCurrentUrl = () => {
  return encodeURIComponent(window.location.href);
};

// Deep link URLs for mobile wallets
const getMobileWalletUrl = (type: 'metamask' | 'coinbase') => {
  const currentUrl = window.location.href;
  
  if (type === 'metamask') {
    // MetaMask deep link - opens in MetaMask browser
    return `https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//, '')}`;
  }
  
  if (type === 'coinbase') {
    // Coinbase Wallet deep link
    return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(currentUrl)}`;
  }
  
  return null;
};

// Check if we're inside a mobile wallet browser
const isInWalletBrowser = () => {
  const ua = navigator.userAgent.toLowerCase();
  return (
    ua.includes('metamask') ||
    ua.includes('coinbase') ||
    ua.includes('trust') ||
    ua.includes('rainbow') ||
    (window.ethereum && isMobile())
  );
};

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
    // Check if on mobile
    if (isMobile() && !isInWalletBrowser()) {
      // On mobile but not in a wallet browser - redirect to wallet app
      const mobileUrl = getMobileWalletUrl(type);
      if (mobileUrl) {
        window.location.href = mobileUrl;
        return;
      }
    }

    const provider = getProvider(type);
    
    // If on mobile and no provider, try the generic ethereum provider
    if (!provider && isMobile()) {
      if (window.ethereum) {
        // Use whatever wallet is available in mobile browser
        try {
          setState(prev => ({ ...prev, isConnecting: true, error: null }));
          
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });

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

          // Save to database
          if (authUser) {
            await saveWalletToDatabase(authUser.id, address);
          }

          setupEventListeners(window.ethereum);
          return;
        } catch (error: any) {
          setState(prev => ({
            ...prev,
            isConnecting: false,
            error: error.message || 'Failed to connect wallet',
          }));
          return;
        }
      }
      
      // No provider at all on mobile - redirect to app store or wallet
      const mobileUrl = getMobileWalletUrl(type);
      if (mobileUrl) {
        window.location.href = mobileUrl;
        return;
      }
    }
    
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
        await saveWalletToDatabase(authUser.id, address);
      }

      setupEventListeners(provider);

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect wallet',
      }));
    }
  }, [authUser]);

  const saveWalletToDatabase = async (userId: string, address: string) => {
    try {
      const { error: dbError } = await supabase
        .from('user_connections')
        .upsert(
          {
            user_id: userId,
            wallet_address: address,
          },
          { onConflict: 'user_id' },
        );

      if (dbError) {
        console.error('Error saving wallet address:', dbError);
      } else {
        console.log('Wallet address saved successfully');
        window.dispatchEvent(new CustomEvent('wallet-connected'));
      }
    } catch (error) {
      console.error('Error saving wallet to database:', error);
    }
  };

  const setupEventListeners = (provider: any) => {
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
        if (authUser) {
          supabase
            .from('user_connections')
            .update({ wallet_address: null })
            .eq('user_id', authUser.id);
        }
      } else {
        const newAddress = accounts[0];
        setState(prev => ({ ...prev, address: newAddress }));
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

    const handleChainChanged = (chainIdHex: string) => {
      setState(prev => ({ ...prev, chainId: parseInt(chainIdHex, 16) }));
    };

    if (provider && typeof provider.on === 'function') {
      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);
    } else if (provider && typeof provider.addEventListener === 'function') {
      provider.addEventListener('accountsChanged', handleAccountsChanged);
      provider.addEventListener('chainChanged', handleChainChanged);
    } else if (provider && window.ethereum) {
      if (typeof window.ethereum.on === 'function') {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
      }
    }
  };

  const disconnect = useCallback(async () => {
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
        // On mobile in wallet browser, use generic ethereum provider
        let provider = window.ethereum;
        let walletType: 'metamask' | 'coinbase' = 'metamask';
        
        if (!isMobile() || !isInWalletBrowser()) {
          provider = getProvider('metamask');
          if (!provider) {
            provider = getProvider('coinbase');
            walletType = 'coinbase';
          }
        }

        if (provider) {
          try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            const chainIdHex = await provider.request({ method: 'eth_chainId' });

            if (accounts.length > 0 && accounts[0].toLowerCase() === data.wallet_address.toLowerCase()) {
              setState({
                address: accounts[0],
                isConnecting: false,
                isConnected: true,
                chainId: parseInt(chainIdHex, 16),
                error: null,
                walletType,
              });
            } else {
              setState(prev => ({
                ...prev,
                address: null,
                isConnected: false,
              }));
            }
          } catch (error) {
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
    isMobile: isMobile(),
    isInWalletBrowser: isInWalletBrowser(),
  };
}

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
