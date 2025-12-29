import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import EthereumProvider from '@walletconnect/ethereum-provider';

type WalletType = 'metamask' | 'coinbase' | 'walletconnect';

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

// WalletConnect Project ID - you can get one free at https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = '3fcc0f2c1c8f1c8b8c8b8c8f1c8f1c8b';

// Detect if user is on mobile
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Deep link URLs for mobile wallets
const getMobileWalletUrl = (type: 'metamask' | 'coinbase') => {
  const currentUrl = window.location.href;
  
  if (type === 'metamask') {
    return `https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//, '')}`;
  }
  
  if (type === 'coinbase') {
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
  const wcProviderRef = useRef<any>(null);
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
      if ((window as any).coinbaseWalletExtension) {
        return (window as any).coinbaseWalletExtension;
      }
      if (window.ethereum?.isCoinbaseWallet) {
        return window.ethereum;
      }
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p: any) => p.isCoinbaseWallet);
      }
    }
    
    if (type === 'metamask') {
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p: any) => p.isMetaMask && !p.isCoinbaseWallet);
      }
      if (window.ethereum?.isMetaMask) {
        return window.ethereum;
      }
    }
    
    return window.ethereum;
  };

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

  const setupEventListeners = (provider: any, walletType: WalletType) => {
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

    const handleChainChanged = (chainIdHex: string | number) => {
      const chainId = typeof chainIdHex === 'string' ? parseInt(chainIdHex, 16) : chainIdHex;
      setState(prev => ({ ...prev, chainId }));
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

    if (provider && typeof provider.on === 'function') {
      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);
      if (walletType === 'walletconnect') {
        provider.on('disconnect', handleDisconnect);
      }
    }
  };

  const connectWalletConnect = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const provider = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [BASE_CHAIN_ID],
        optionalChains: [1, BASE_SEPOLIA_CHAIN_ID],
        showQrModal: true,
        metadata: {
          name: 'Base Remittance',
          description: 'Send stablecoins on Base network',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.ico`],
        },
      });

      wcProviderRef.current = provider;

      await provider.connect();

      const accounts = provider.accounts;
      const chainId = provider.chainId;

      if (accounts.length > 0) {
        const address = accounts[0];
        
        setState({
          address,
          isConnecting: false,
          isConnected: true,
          chainId,
          error: null,
          walletType: 'walletconnect',
        });

        if (authUser) {
          await saveWalletToDatabase(authUser.id, address);
        }

        setupEventListeners(provider, 'walletconnect');
      } else {
        throw new Error('No accounts returned');
      }
    } catch (error: any) {
      console.error('WalletConnect error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect with WalletConnect',
      }));
    }
  }, [authUser]);

  const connect = useCallback(async (type: WalletType = 'metamask') => {
    // Handle WalletConnect separately
    if (type === 'walletconnect') {
      return connectWalletConnect();
    }

    // Check if on mobile and not in wallet browser
    if (isMobile() && !isInWalletBrowser()) {
      const mobileUrl = getMobileWalletUrl(type);
      if (mobileUrl) {
        window.location.href = mobileUrl;
        return;
      }
    }

    const provider = getProvider(type);
    
    // If on mobile and no specific provider, try generic ethereum
    if (!provider && isMobile()) {
      if (window.ethereum) {
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

          if (authUser) {
            await saveWalletToDatabase(authUser.id, address);
          }

          setupEventListeners(window.ethereum, type);
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

      if (authUser) {
        await saveWalletToDatabase(authUser.id, address);
      }

      setupEventListeners(provider, type);

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect wallet',
      }));
    }
  }, [authUser, connectWalletConnect]);

  const disconnect = useCallback(async () => {
    // Disconnect WalletConnect if active
    if (state.walletType === 'walletconnect' && wcProviderRef.current) {
      try {
        await wcProviderRef.current.disconnect();
      } catch (error) {
        console.error('Error disconnecting WalletConnect:', error);
      }
      wcProviderRef.current = null;
    }

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
  }, [authUser, state.walletType]);

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
        let provider = window.ethereum;
        let walletType: WalletType = 'metamask';
        
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
    let provider: any;
    
    if (state.walletType === 'walletconnect' && wcProviderRef.current) {
      provider = wcProviderRef.current;
    } else if (state.walletType === 'metamask' || state.walletType === 'coinbase') {
      provider = getProvider(state.walletType);
    } else {
      provider = window.ethereum;
    }
    
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