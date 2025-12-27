import { useEffect } from 'react';
import { Wallet, User, Check, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWallet } from '@/hooks/useWallet';
import { useFarcaster } from '@/hooks/useFarcaster';
import { motion } from 'framer-motion';

export function ConnectionPanel() {
  const wallet = useWallet();
  const farcaster = useFarcaster();

  useEffect(() => {
    farcaster.loadConnection();
  }, [farcaster.loadConnection]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Connect Your Accounts</CardTitle>
          <CardDescription>
            Link your wallet and Farcaster to enable agent actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Wallet Connection */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border/50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${wallet.isConnected ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-sm">Wallet</p>
                {wallet.isConnected ? (
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatAddress(wallet.address!)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            
            {wallet.isConnected ? (
              <div className="flex items-center gap-2">
                {!wallet.isOnBase && (
                  <Button size="sm" variant="outline" onClick={wallet.switchToBase}>
                    Switch to Base
                  </Button>
                )}
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs">
                  <Check className="h-3 w-3" />
                  {wallet.isOnBase ? 'Base' : 'Connected'}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={wallet.connect}
                disabled={wallet.isConnecting}
                className="bg-gradient-primary hover:opacity-90"
              >
                {wallet.isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Connect
              </Button>
            )}
          </div>

          {/* Farcaster Connection */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border/50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${farcaster.isConnected ? 'bg-farcaster-purple/20 text-farcaster-purple' : 'bg-farcaster-purple/20 text-farcaster-purple'}`}>
                {farcaster.isConnected && farcaster.user?.pfpUrl ? (
                  <img
                    src={farcaster.user.pfpUrl}
                    alt={farcaster.user.displayName}
                    className="h-5 w-5 rounded-full"
                  />
                ) : (
                  <User className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="font-medium text-sm">Farcaster</p>
                {farcaster.isConnected && farcaster.user ? (
                  <p className="text-xs text-muted-foreground">
                    @{farcaster.user.username}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
            </div>
            
            {farcaster.isConnected ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={farcaster.disconnect}>
                  Disconnect
                </Button>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-farcaster-purple/20 text-farcaster-purple text-xs">
                  <Check className="h-3 w-3" />
                  Connected
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={farcaster.connect}
                disabled={farcaster.isConnecting}
                className="bg-farcaster-purple hover:bg-farcaster-purple/90"
              >
                {farcaster.isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
