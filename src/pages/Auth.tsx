import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { FarcasterSignIn } from '@/components/FarcasterSignIn';
import { getInjectedProvider, personalSign, requestWalletAddress, type WalletProviderType } from '@/lib/walletAuth';
import { supabase } from '@/integrations/supabase/client';

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const wallet = useWallet();
  const { toast } = useToast();

  const [walletAuthLoading, setWalletAuthLoading] = useState<WalletProviderType | null>(null);
  
  // Farcaster sign-in dialog state
  const [showFarcasterDialog, setShowFarcasterDialog] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleWalletAuth = async (type: WalletProviderType) => {
    const walletName = type === 'coinbase' ? 'Coinbase Wallet' : 'MetaMask';
    const provider = getInjectedProvider(type);

    if (!provider) {
      toast({
        title: `${walletName} Not Found`,
        description: `Please install ${walletName} to continue`,
        variant: 'destructive',
      });
      window.open(
        type === 'coinbase' ? 'https://www.coinbase.com/wallet' : 'https://metamask.io/download/',
        '_blank'
      );
      return;
    }

    setWalletAuthLoading(type);

    try {
      // Keep existing connect behavior (updates wallet UI state)
      await wallet.connect(type);

      const address = await requestWalletAddress(provider);
      const message = `Sign in to FarAgent\n\nWallet: ${address}\nDomain: ${window.location.host}`;
      const signature = await personalSign(provider, address, message);

      // Ensure signature has 0x prefix for password generation
      const normalizedSignature = signature.startsWith('0x') ? signature : `0x${signature}`;
      const normalizedAddress = address.startsWith('0x') ? address.toLowerCase() : `0x${address.toLowerCase()}`;
      const addressWithoutPrefix = normalizedAddress.replace('0x', '').toLowerCase();

      // Check if this wallet is already linked to a Farcaster account
      // Try multiple address formats since they might be stored differently
      const { data: existingConnection } = await supabase
        .from('user_connections')
        .select('user_id, farcaster_fid, farcaster_username')
        .or(`wallet_address.eq.${normalizedAddress},wallet_address.eq.${addressWithoutPrefix},wallet_address.eq.${address.toLowerCase()},wallet_address.eq.${address}`)
        .maybeSingle();

      let authUser = null;

      if (existingConnection?.user_id && existingConnection.farcaster_fid) {
        // Wallet is already linked to a Farcaster account - sign in with Farcaster credentials
        console.log('Wallet already linked to Farcaster account, signing in with Farcaster...', {
          fid: existingConnection.farcaster_fid,
          username: existingConnection.farcaster_username,
        });
        
        const farcasterEmail = `farcaster_${existingConnection.farcaster_fid}@faragent.local`;
        const farcasterPassword = `fc_${existingConnection.farcaster_fid}_${existingConnection.farcaster_username}`;
        
        // Try alternative password formats (same as FarcasterSignIn does)
        const altPasswords = [
          farcasterPassword, // Current: fc_fid_username
          `fc_${existingConnection.farcaster_fid}_${existingConnection.farcaster_username}_stable_key`, // Old format
        ];
        
        let signedInWithFarcaster = false;
        for (const altPassword of altPasswords) {
          const { error: altError } = await signIn(farcasterEmail, altPassword);
          if (!altError) {
            signedInWithFarcaster = true;
            const { data: { user: userData } } = await supabase.auth.getUser();
            authUser = userData;
            
            if (authUser) {
              const { error: updateError } = await supabase
                .from('user_connections')
                .update({ wallet_address: normalizedAddress })
                .eq('user_id', authUser.id);
              
              if (updateError) {
                console.error('Error updating wallet address:', updateError);
              } else {
                console.log('Successfully signed in with Farcaster account and linked wallet');
                // Trigger reload of connections
                window.dispatchEvent(new CustomEvent('wallet-connected'));
                window.dispatchEvent(new CustomEvent('farcaster-connected'));
              }
            }
            break;
          }
        }
        
        if (!signedInWithFarcaster) {
          // Couldn't sign in with any password format
          // Don't create a wallet account - the Farcaster account exists
          toast({
            title: 'Sign in with Farcaster',
            description: `Your wallet is linked to Farcaster account @${existingConnection.farcaster_username}. Please use the Farcaster sign-in button to sign in.`,
            variant: 'destructive',
          });
          throw new Error(
            `Your wallet is linked to Farcaster account @${existingConnection.farcaster_username}, ` +
            `but the password cannot be verified. Please sign in with Farcaster instead using the Farcaster sign-in button.`
          );
        }
      }

      // If no existing account or couldn't sign in, create/sign in with wallet account
      // BUT: Only if we didn't find an existing Farcaster account
      if (!authUser && !existingConnection?.farcaster_fid) {
        // Deterministic credentials from signature (proves ownership)
        const walletEmail = `wallet_${addressWithoutPrefix}@faragent.local`;
        // Use signature without 0x prefix for password (slice after removing 0x)
        const signaturePart = normalizedSignature.replace('0x', '').slice(0, 40);
        const addressPart = addressWithoutPrefix.slice(0, 4);
        const walletPassword = `w_${signaturePart}_${addressPart}`;

        const { error: signInError } = await signIn(walletEmail, walletPassword);

        if (signInError) {
          const { error: signUpError } = await signUp(walletEmail, walletPassword);

          if (signUpError && !signUpError.message.includes('already registered')) {
            throw signUpError;
          }

          if (signUpError?.message.includes('already registered')) {
            const { error: retryError } = await signIn(walletEmail, walletPassword);
            if (retryError) throw retryError;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        const { data: { user: userData } } = await supabase.auth.getUser();
        authUser = userData;
      }

      // Update user_connections with wallet address (and preserve Farcaster data if it exists)
      if (authUser) {
        // Get existing connection to preserve Farcaster data
        const { data: currentConnection } = await supabase
          .from('user_connections')
          .select('*')
          .eq('user_id', authUser.id)
          .maybeSingle();

        // Prepare update data - preserve Farcaster data if it exists
        const updateData: any = {
          user_id: authUser.id,
          wallet_address: normalizedAddress,
        };

        // Preserve existing Farcaster data if it exists
        if (currentConnection?.farcaster_fid) {
          updateData.farcaster_fid = currentConnection.farcaster_fid;
          updateData.farcaster_username = currentConnection.farcaster_username;
          updateData.farcaster_display_name = currentConnection.farcaster_display_name;
          updateData.farcaster_pfp_url = currentConnection.farcaster_pfp_url;
          updateData.farcaster_signer_uuid = currentConnection.farcaster_signer_uuid;
        }

        const { error: dbError } = await supabase
          .from('user_connections')
          .upsert(updateData, { onConflict: 'user_id' });

        if (dbError) {
          console.error('Error updating user_connections:', dbError);
        } else {
          console.log('Wallet address saved, Farcaster data preserved');
          // Trigger reload of connections
          window.dispatchEvent(new CustomEvent('wallet-connected'));
          if (currentConnection?.farcaster_fid) {
            window.dispatchEvent(new CustomEvent('farcaster-connected'));
          }
        }
      }

      toast({
        title: 'Wallet verified',
        description: `Signed in with ${walletName}`,
      });

      navigate('/');
    } catch (error: any) {
      toast({
        title: 'Wallet sign-in failed',
        description: error?.message || 'Could not sign in with wallet',
        variant: 'destructive',
      });
    } finally {
      setWalletAuthLoading(null);
    }
  };

  const handleFarcasterConnect = () => {
    setShowFarcasterDialog(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 bg-background relative overflow-hidden w-full">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-primary/10 rounded-full blur-2xl animate-float" />
        <div className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-accent/10 rounded-full blur-2xl animate-float" style={{ animationDelay: '3s' }} />
      </div>

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-full sm:max-w-md relative z-10 px-2 sm:px-0"
      >
        <Card className="glass border-border/50 shadow-2xl backdrop-blur-xl">
          <CardHeader className="text-center space-y-6 pb-2">
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* Wallet & Farcaster Connect Options */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleWalletAuth('metamask')}
                disabled={!!walletAuthLoading}
                className="w-full flex items-center justify-between p-3 sm:p-4 rounded-xl bg-secondary/50 border border-border/50 hover:bg-secondary hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <img 
                      src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" 
                      alt="MetaMask"
                      className="w-5 h-5 sm:w-6 sm:h-6"
                    />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="font-medium text-sm sm:text-base text-foreground truncate">Continue with MetaMask</p>
                    <p className="text-xs text-muted-foreground hidden sm:block">Sign a message to verify ownership</p>
                  </div>
                </div>
                {walletAuthLoading === 'metamask' ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground animate-spin flex-shrink-0 ml-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-orange-500 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleWalletAuth('coinbase')}
                disabled={!!walletAuthLoading}
                className="w-full flex items-center justify-between p-3 sm:p-4 rounded-xl bg-secondary/50 border border-border/50 hover:bg-secondary hover:border-blue-500/30 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 48 48" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="24" cy="24" r="24" fill="#0052FF"/>
                      <path d="M24 10C16.268 10 10 16.268 10 24s6.268 14 14 14 14-6.268 14-14S31.732 10 24 10zm-4.2 17.5a3.5 3.5 0 1 1 0-7h8.4a3.5 3.5 0 1 1 0 7h-8.4z" fill="#fff"/>
                    </svg>
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="font-medium text-sm sm:text-base text-foreground truncate">Continue with Coinbase</p>
                    <p className="text-xs text-muted-foreground hidden sm:block">Sign a message to verify ownership</p>
                  </div>
                </div>
                {walletAuthLoading === 'coinbase' ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground animate-spin flex-shrink-0 ml-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                )}
              </button>

              <button
                type="button"
                onClick={handleFarcasterConnect}
                className="w-full flex items-center justify-between p-3 sm:p-4 rounded-xl bg-secondary/50 border border-border/50 hover:bg-secondary hover:border-purple-500/30 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 1000 1000" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="1000" height="1000" rx="200" fill="#8A63D2"/>
                      <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" fill="white"/>
                      <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V351.111H331.111L360 253.333H128.889Z" fill="white"/>
                      <path d="M640 253.333L668.889 351.111H693.333V746.667C681.06 746.667 671.111 756.616 671.111 768.889V795.556H666.667C654.394 795.556 644.444 805.505 644.444 817.778V844.444H893.333V817.778C893.333 805.505 883.384 795.556 871.111 795.556H866.667V768.889C866.667 756.616 856.717 746.667 844.444 746.667H817.778V351.111H842.222L871.111 253.333H640Z" fill="white"/>
                    </svg>
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="font-medium text-sm sm:text-base text-foreground truncate">Continue with Farcaster</p>
                    <p className="text-xs text-muted-foreground hidden sm:block">Scan QR code with Warpcast</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-purple-500 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
              </button>
            </div>

            {/* Connected wallet indicator */}
            {wallet.isConnected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30"
              >
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-400">
                  Connected: {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                  {wallet.walletType && <span className="text-muted-foreground ml-1">({wallet.walletType})</span>}
                </span>
              </motion.div>
            )}

          </CardContent>
        </Card>

        {/* Footer text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-muted-foreground/60 mt-6"
        >
          Built on Base × Farcaster
        </motion.p>
      </motion.div>

      {/* Farcaster Sign In Dialog */}
      <FarcasterSignIn 
        open={showFarcasterDialog} 
        onOpenChange={setShowFarcasterDialog} 
      />
    </div>
  );
}
