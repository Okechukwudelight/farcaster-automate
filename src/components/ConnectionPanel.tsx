import { useEffect } from 'react';
import { Wallet, User, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWallet } from '@/hooks/useWallet';
import { useFarcaster } from '@/hooks/useFarcaster';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';

export function ConnectionPanel() {
  const wallet = useWallet();
  const farcaster = useFarcaster();
  const { user: authUser } = useAuth();

  // Reload connections when auth user changes or component mounts
  useEffect(() => {
    if (authUser) {
      farcaster.loadConnection();
      wallet.loadWallet();
    }
  }, [authUser, farcaster.loadConnection, wallet.loadWallet]);

  // Also reload when window regains focus (in case user signed in in another tab/window)
  useEffect(() => {
    const handleFocus = () => {
      if (authUser) {
        farcaster.loadConnection();
        wallet.loadWallet();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [authUser, farcaster.loadConnection, wallet.loadWallet]);

  // Listen for Farcaster connection events
  useEffect(() => {
    const handleFarcasterConnected = () => {
      if (authUser) {
        // Small delay to ensure database is ready
        setTimeout(() => {
          farcaster.loadConnection();
        }, 500);
      }
    };
    window.addEventListener('farcaster-connected', handleFarcasterConnected);
    return () => window.removeEventListener('farcaster-connected', handleFarcasterConnected);
  }, [authUser, farcaster.loadConnection]);

  // Listen for wallet connection events
  useEffect(() => {
    const handleWalletConnected = () => {
      if (authUser) {
        setTimeout(() => {
          wallet.loadWallet();
        }, 500);
      }
    };
    window.addEventListener('wallet-connected', handleWalletConnected);
    return () => window.removeEventListener('wallet-connected', handleWalletConnected);
  }, [authUser, wallet.loadWallet]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="glass border-border/50 w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Connect Your Accounts</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Link your wallet and Farcaster to enable agent actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Wallet Connection */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-lg bg-secondary/50 border border-border/50">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className={`p-2 rounded-lg flex-shrink-0 ${wallet.isConnected ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">Wallet</p>
                {wallet.isConnected ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {formatAddress(wallet.address!)}
                    </p>
                    {wallet.walletType && (
                      <span className="text-xs text-primary capitalize flex-shrink-0">({wallet.walletType})</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            
            {wallet.isConnected ? (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                {!wallet.isOnBase && (
                  <Button size="sm" variant="outline" onClick={wallet.switchToBase} className="text-xs">
                    Switch to Base
                  </Button>
                )}
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs whitespace-nowrap">
                  <Check className="h-3 w-3" />
                  {wallet.isOnBase ? 'Base' : 'Connected'}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => wallet.connect('metamask')}
                  disabled={wallet.isConnecting}
                  className="text-foreground text-xs"
                >
                  {wallet.isConnecting ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <img 
                      src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" 
                      alt="MetaMask"
                      className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1"
                    />
                  )}
                  <span className="hidden sm:inline">MetaMask</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => wallet.connect('coinbase')}
                  disabled={wallet.isConnecting}
                  className="bg-[#0052FF] hover:bg-[#0052FF]/90 text-white text-xs"
                >
                  {wallet.isConnecting ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 48 48" className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="24" cy="24" r="24" fill="#0052FF"/>
                      <path d="M24 10C16.268 10 10 16.268 10 24s6.268 14 14 14 14-6.268 14-14S31.732 10 24 10zm-4.2 17.5a3.5 3.5 0 1 1 0-7h8.4a3.5 3.5 0 1 1 0 7h-8.4z" fill="#fff"/>
                    </svg>
                  )}
                  <span className="hidden sm:inline">Coinbase</span>
                </Button>
              </div>
            )}
          </div>

          {/* Farcaster Connection */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-lg bg-secondary/50 border border-border/50">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className={`p-2 rounded-lg flex-shrink-0 ${farcaster.isConnected ? 'bg-farcaster-purple/20 text-farcaster-purple' : 'bg-farcaster-purple/20 text-farcaster-purple'}`}>
                {farcaster.isConnected && farcaster.user?.pfpUrl ? (
                  <img
                    src={farcaster.user.pfpUrl}
                    alt={farcaster.user.displayName}
                    className="h-4 w-4 sm:h-5 sm:w-5 rounded-full"
                  />
                ) : (
                  <User className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">Farcaster</p>
                {farcaster.isConnected && farcaster.user ? (
                  <p className="text-xs text-muted-foreground truncate">
                    @{farcaster.user.username}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            
            {farcaster.isConnected ? (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={farcaster.disconnect} className="text-muted-foreground hover:text-foreground text-xs">
                  Disconnect
                </Button>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-farcaster-purple/20 text-farcaster-purple text-xs whitespace-nowrap">
                  <Check className="h-3 w-3" />
                  Connected
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={farcaster.connect}
                disabled={farcaster.isConnecting}
                className="bg-farcaster-purple hover:bg-farcaster-purple/90 text-white text-xs flex-shrink-0"
              >
                {farcaster.isConnecting ? (
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2 animate-spin" />
                ) : null}
                Connect
              </Button>
            )}
          </div>

          {(wallet.error || farcaster.error) && (
            <p className="text-sm text-destructive">
              {wallet.error || farcaster.error}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
