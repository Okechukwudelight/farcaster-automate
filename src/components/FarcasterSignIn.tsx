import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSignIn, QRCode } from '@farcaster/auth-kit';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Smartphone, QrCode } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface FarcasterSignInProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FarcasterSignIn({ open, onOpenChange }: FarcasterSignInProps) {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  const handleSuccess = useCallback(async (res: {
    fid?: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
    message?: string;
    signature?: `0x${string}`;
  }) => {
    if (!res.fid || !res.username) {
      console.error('Missing fid or username in response');
      return;
    }

    setIsProcessing(true);

    try {
      const { fid, username, displayName, pfpUrl, signature } = res;

      toast({
        title: 'Farcaster Verified',
        description: `Welcome @${username}! Creating your account...`,
      });

      // Stable credentials based on verified Farcaster identity
      const farcasterEmail = `farcaster_${fid}@faragent.local`;
      const farcasterPassword = `fc_${fid}_${(signature || username).slice(0, 28)}_pwd`;

      const { error: signInError } = await signIn(farcasterEmail, farcasterPassword);

      if (signInError) {
        const { error: signUpError } = await signUp(farcasterEmail, farcasterPassword);

        if (signUpError && !signUpError.message.includes('already registered')) {
          throw signUpError;
        }

        if (signUpError?.message.includes('already registered')) {
          const { error: retryError } = await signIn(farcasterEmail, farcasterPassword);
          if (retryError) throw retryError;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        await supabase
          .from('user_connections')
          .upsert(
            {
              user_id: authUser.id,
              farcaster_fid: fid,
              farcaster_username: username,
              farcaster_display_name: displayName || username,
              farcaster_pfp_url: pfpUrl || '',
            },
            { onConflict: 'user_id' },
          );
      }

      toast({
        title: 'Welcome!',
        description: `Signed in as @${username}`,
      });

      onOpenChange(false);
      navigate('/');
    } catch (error: any) {
      console.error('Farcaster auth error:', error);
      toast({
        title: 'Authentication Failed',
        description: error.message || 'Could not complete Farcaster sign in',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [signIn, signUp, toast, navigate, onOpenChange]);

  const { 
    signIn: startSignIn, 
    connect,
    reconnect,
    url, 
    isConnected,
    isSuccess, 
    isError, 
    error, 
    data, 
    isPolling,
    channelToken,
  } = useSignIn({
    onSuccess: handleSuccess,
    onError: (err) => {
      console.error('Farcaster AuthKit error:', err);
      toast({
        title: 'Farcaster Error',
        description: err?.message || 'Failed to initialize sign-in',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (open && !hasStarted) {
      setHasStarted(true);
      console.log('Starting Farcaster sign-in...');
      // Try connect first, then signIn
      try {
        connect();
        startSignIn();
      } catch (e) {
        console.error('Error starting Farcaster auth:', e);
      }
    }

    if (!open && hasStarted) {
      setHasStarted(false);
    }
  }, [open, hasStarted, connect, startSignIn]);

  // Debug: log state changes
  useEffect(() => {
    console.log('Farcaster state:', { 
      url, 
      isPolling, 
      isSuccess, 
      isError, 
      isConnected,
      channelToken,
      error: error?.message 
    });
  }, [url, isPolling, isSuccess, isError, isConnected, channelToken, error]);

  const handleStartSignIn = useCallback(() => {
    setHasStarted(true);
    console.log('Manual start triggered');
    connect();
    startSignIn();
  }, [connect, startSignIn]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg viewBox="0 0 1000 1000" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="1000" height="1000" rx="200" fill="#8A63D2" />
                <path
                  d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z"
                  fill="white"
                />
                <path
                  d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V351.111H331.111L360 253.333H128.889Z"
                  fill="white"
                />
                <path
                  d="M640 253.333L668.889 351.111H693.333V746.667C681.06 746.667 671.111 756.616 671.111 768.889V795.556H666.667C654.394 795.556 644.444 805.505 644.444 817.778V844.444H893.333V817.778C893.333 805.505 883.384 795.556 871.111 795.556H866.667V768.889C866.667 756.616 856.717 746.667 844.444 746.667H817.778V351.111H842.222L871.111 253.333H640Z"
                  fill="white"
                />
              </svg>
            </div>
            Sign in with Farcaster
          </DialogTitle>
          <DialogDescription>
            {isMobile
              ? 'Open Warpcast to confirm (no QR scan needed on phone)'
              : 'Scan the QR code with Warpcast or confirm from your mobile app'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-6">
          {!hasStarted && !isSuccess && !isProcessing && (
            <Button onClick={handleStartSignIn} className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white">
              <QrCode className="w-5 h-5 mr-2" />
              Generate QR Code
            </Button>
          )}

          {hasStarted && !url && !isSuccess && !isProcessing && !isError && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              <p className="text-sm text-muted-foreground">Generating sign-in…</p>
            </div>
          )}

          {url && !isSuccess && !isProcessing && (
            <>
              {isMobile ? (
                <Button asChild className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white">
                  <a href={url}>Open Warpcast to confirm</a>
                </Button>
              ) : (
                <>
                  <div className="p-4 bg-white rounded-2xl shadow-lg">
                    <QRCode uri={url} />
                  </div>

                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Smartphone className="w-4 h-4" />
                      <span className="text-sm">Scan with Warpcast</span>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-[250px]">
                      Open Warpcast on your phone, go to Settings → Advanced → Scan QR Code
                    </p>

                    <div className="flex items-center gap-2 mt-4">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                      <span className="text-sm text-purple-400">Waiting for confirmation...</span>
                    </div>
                  </div>

                  <a href={url} className="text-sm text-purple-400 hover:text-purple-300 underline">
                    Open in Warpcast app
                  </a>
                </>
              )}
            </>
          )}

          {(isSuccess || isProcessing) && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">{data?.username ? `Signing in as @${data.username}...` : 'Processing...'}</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-red-400">{error?.message || 'Something went wrong'}</p>
              <Button onClick={handleStartSignIn} variant="outline" className="border-border/50">
                Try Again
              </Button>
            </div>
          )}

          {/* Debug panel */}
          <div className="w-full p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1 font-mono">
            <p><span className="font-medium">Status:</span> {isPolling ? 'Polling' : isSuccess ? 'Success' : isError ? 'Error' : hasStarted ? 'Started' : 'Idle'}</p>
            <p><span className="font-medium">Connected:</span> {isConnected ? 'Yes' : 'No'}</p>
            <p><span className="font-medium">Channel:</span> {channelToken ? channelToken.slice(0, 12) + '...' : 'None'}</p>
            <p><span className="font-medium">URL:</span> {url ? 'Generated ✓' : 'Not yet'}</p>
            {error && <p className="text-red-400"><span className="font-medium">Error:</span> {error.message}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

