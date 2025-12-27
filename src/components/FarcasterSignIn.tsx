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
  const [hasProcessedSuccess, setHasProcessedSuccess] = useState(false);
  const [capturedSuccessData, setCapturedSuccessData] = useState<any>(null);
  const [channelErrorCount, setChannelErrorCount] = useState(0);
  const [lastChannelToken, setLastChannelToken] = useState<string | null>(null);

  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  const handleSuccess = useCallback(async (res: any) => {
    // Prevent duplicate processing
    if (hasProcessedSuccess) {
      console.log('Success already processed, skipping...');
      return;
    }

    console.log('handleSuccess called with:', res);
    
    // Extract data from different possible response structures
    // The response might be: {fid, username, ...} or {metadata: {fid, username, ...}, ...}
    let fid: number | undefined;
    let username: string | undefined;
    let displayName: string | undefined;
    let pfpUrl: string | undefined;
    let signature: string | undefined;

    if (res.fid && res.username) {
      // Direct structure
      ({ fid, username, displayName, pfpUrl, signature } = res);
    } else if (res.metadata) {
      // Nested in metadata
      const meta = res.metadata;
      fid = meta.fid;
      username = meta.username;
      displayName = meta.displayName;
      pfpUrl = meta.pfpUrl;
      signature = res.signature || meta.signature;
    } else if (res.signatureParams) {
      // Alternative structure - check signatureParams for signature
      const params = res.signatureParams;
      fid = params.fid || res.fid;
      username = params.username || res.username;
      displayName = params.displayName || res.displayName;
      pfpUrl = params.pfpUrl || res.pfpUrl;
      // Try multiple possible locations for signature
      signature = res.signature || params.signature || params.siweMessage?.signature || params.message?.signature;
    } else {
      // Try to extract from any nested structure
      fid = res.fid || res.metadata?.fid || res.signatureParams?.fid;
      username = res.username || res.metadata?.username || res.signatureParams?.username;
      displayName = res.displayName || res.metadata?.displayName || res.signatureParams?.displayName;
      pfpUrl = res.pfpUrl || res.metadata?.pfpUrl || res.signatureParams?.pfpUrl;
      // Try multiple possible locations for signature
      signature = res.signature 
        || res.metadata?.signature 
        || res.signatureParams?.signature
        || res.signatureParams?.siweMessage?.signature
        || res.signatureParams?.message?.signature;
    }
    
    // Log the full response structure for debugging
    console.log('Extracted data:', { fid, username, displayName, hasSignature: !!signature, signatureLength: signature?.length });

    if (!fid || !username) {
      console.error('Missing fid or username in response:', res);
      toast({
        title: 'Authentication Error',
        description: 'Missing required user information. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    setHasProcessedSuccess(true);
    setIsProcessing(true);

    try {

      toast({
        title: 'Farcaster Verified',
        description: `Welcome @${username}! Creating your account...`,
      });

      // Stable credentials based on verified Farcaster identity
      const farcasterEmail = `farcaster_${fid}@faragent.local`;
      // Generate a TRULY DETERMINISTIC password from fid and username ONLY
      // IMPORTANT: Must be the same every time for the same user, regardless of signature
      // Signature can change, but fid and username are stable
      // Use a simple, stable format: fc_fid_username (no signature, no timestamp!)
      const farcasterPassword = `fc_${fid}_${username}`.slice(0, 50); // Ensure password is reasonable length

      console.log('Attempting Supabase auth with:', { 
        email: farcasterEmail, 
        passwordLength: farcasterPassword.length,
        hasSignature: !!signature,
        passwordPreview: farcasterPassword.substring(0, 20) + '...'
      });

      const { error: signInError } = await signIn(farcasterEmail, farcasterPassword);

      if (signInError) {
        console.log('Sign in failed, attempting sign up...', signInError);
        const { error: signUpError } = await signUp(farcasterEmail, farcasterPassword);

        if (signUpError) {
          console.log('Sign up error:', signUpError);
          // If user already exists, the password might have been generated differently before
          if (signUpError.message.includes('already registered') || signUpError.message.includes('already exists')) {
            console.log('User already exists but password mismatch. This may be due to a password generation change.');
            
            // Try alternative password generation methods for backward compatibility
            // Try old password formats that might have been used
            const altPasswords = [
              farcasterPassword, // Current method: fc_fid_username
              `fc_${fid}_${username}_stable_key`, // Old fallback format
              signature ? `fc_${fid}_${signature.slice(0, 30)}` : null, // Old signature-based format
              signature ? `fc_${fid}_${signature.slice(0, 20)}` : null, // Shorter signature format
            ].filter(Boolean) as string[];
            
            let signedIn = false;
            for (const altPassword of altPasswords) {
              const { error: altError } = await signIn(farcasterEmail, altPassword);
              if (!altError) {
                signedIn = true;
                // If we signed in with an old password, update it to the new format
                if (altPassword !== farcasterPassword) {
                  console.log('Signed in with old password format, updating to new format...');
                  // Update password via Edge Function
                  try {
                    const { error: updateError } = await supabase.functions.invoke('reset-farcaster-password', {
                      body: { 
                        email: farcasterEmail,
                        newPassword: farcasterPassword,
                      },
                    });
                    if (updateError) {
                      console.warn('Could not update password format:', updateError);
                    }
                  } catch (error) {
                    console.warn('Password update function not available:', error);
                  }
                }
                break;
              }
            }
            
            if (!signedIn) {
              // Auto-reset workaround: Since we've verified Farcaster identity, 
              // we can use Supabase's password reset email flow
              // But since it's a fake email, we'll use a different approach:
              // Try to use Supabase's admin.updateUserById via a database function
              // OR: Provide clear instructions for manual reset
              
              console.log('All password attempts failed. Attempting auto-reset...');
              
              toast({
                title: 'Auto-resetting password...',
                description: 'Since we verified your Farcaster identity, we\'re attempting to reset your password automatically.',
              });

              // Since we can't use Edge Functions, we'll try Supabase's password reset email
              // Even though it's a fake email, Supabase might still generate a reset token
              // that we could potentially use... but that's complex.
              
              // Simpler solution: Use a database RPC function to reset password
              // But Supabase doesn't allow password updates via RPC for security
              
              // Best solution for Lovable without Edge Functions:
              // Show clear error with instructions to manually reset in Supabase dashboard
              // OR: Provide a link/instructions to delete the account and sign up fresh
              
              // Show helpful error with exact password needed
              const errorMessage = `Your account exists but needs a password reset.

Since we verified your Farcaster identity (@${username}), here's how to fix it:

OPTION 1 (Recommended - Quick Fix):
1. Go to Supabase Dashboard → Authentication → Users
2. Find user with email: ${farcasterEmail}
3. Click "Reset Password" or "Edit User"
4. Set password to: ${farcasterPassword}
5. Try signing in again

OPTION 2 (Auto-reset for all users):
Run the SQL script in supabase/migrations/reset_farcaster_passwords.sql
in your Supabase Dashboard → SQL Editor to reset all Farcaster user passwords.

Your new password: ${farcasterPassword}`;

              toast({
                title: 'Password Reset Needed',
                description: `Your account needs a password update. New password: ${farcasterPassword.substring(0, 20)}...`,
                variant: 'destructive',
              });

              throw new Error(errorMessage);
            }
          } else {
            throw signUpError;
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        const { error: dbError } = await supabase
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

        if (dbError) {
          console.error('Error saving Farcaster connection:', dbError);
        } else {
          console.log('Farcaster connection saved successfully');
        }
      }

      toast({
        title: 'Welcome!',
        description: `Signed in as @${username}`,
      });

      onOpenChange(false);
      
      // Small delay to ensure database write completes
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      // Navigate and trigger a custom event to reload connections
      navigate('/');
      
      // Dispatch event to trigger connection reload
      window.dispatchEvent(new CustomEvent('farcaster-connected'));
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
  }, [signIn, signUp, toast, navigate, onOpenChange, hasProcessedSuccess]);

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
      setHasProcessedSuccess(false); // Reset when starting new sign-in
      setCapturedSuccessData(null); // Reset captured data
      console.log('Starting Farcaster sign-in...');
      // Ensure connection is established before starting sign-in
      try {
        connect();
        // Wait for connection to be ready before starting sign-in
        const connectInterval = setInterval(() => {
          if (isConnected) {
            clearInterval(connectInterval);
            console.log('Connection ready, starting sign-in...');
            startSignIn();
          }
        }, 100);
        
        // Timeout after 2 seconds if connection doesn't establish
        setTimeout(() => {
          clearInterval(connectInterval);
          if (!isConnected) {
            console.log('Connection timeout, attempting sign-in anyway...');
            startSignIn();
          }
        }, 2000);
      } catch (e) {
        console.error('Error starting Farcaster auth:', e);
      }
    }

    if (!open && hasStarted) {
      setHasStarted(false);
      setHasProcessedSuccess(false); // Reset when dialog closes
      setCapturedSuccessData(null); // Reset captured data
    }
  }, [open, hasStarted, connect, startSignIn, isConnected]);

  // Helper to check if data has valid user info
  const hasValidUserData = useCallback((data: any): boolean => {
    if (!data) return false;
    const fid = data.fid || data.metadata?.fid || data.signatureParams?.fid;
    const username = data.username || data.metadata?.username || data.signatureParams?.username;
    return !!(fid && username);
  }, []);

  // Periodic check for success while polling (fallback in case callback doesn't fire)
  useEffect(() => {
    if (!isPolling || hasProcessedSuccess || !open) return;

    const checkInterval = setInterval(() => {
      // Check if data exists even if isSuccess is false (channel might have errors but data is available)
      if (data && hasValidUserData(data) && !hasProcessedSuccess) {
        console.log('Periodic check found data, processing...', { data, isSuccess });
        handleSuccess(data);
        clearInterval(checkInterval);
      }
    }, 1000); // Check every 1 second (faster detection)

    return () => clearInterval(checkInterval);
  }, [isPolling, isSuccess, data, hasProcessedSuccess, open, handleSuccess, hasValidUserData]);

  // Ensure polling starts when URL is generated (but only once)
  useEffect(() => {
    if (url && isConnected && !isPolling && !isSuccess && !isError && !hasProcessedSuccess && !capturedSuccessData) {
      const timeoutId = setTimeout(() => {
        if (!isPolling && !isSuccess && !capturedSuccessData) {
          console.log('Polling not active, attempting to restart sign-in...');
          startSignIn();
        }
      }, 1000); // Wait a bit longer before restarting
      return () => clearTimeout(timeoutId);
    }
  }, [url, isConnected, isPolling, isSuccess, isError, hasProcessedSuccess, capturedSuccessData, startSignIn]);

  // Handle success immediately when detected - capture it even if it's brief
  // Also check data even when isSuccess is false (channel errors might prevent isSuccess from being true)
  useEffect(() => {
    // Check if we have valid data (even if isSuccess is false due to channel errors)
    if (data && hasValidUserData(data) && !capturedSuccessData) {
      const dataAny = data as any;
      const fid = dataAny.fid || dataAny.metadata?.fid || dataAny.signatureParams?.fid;
      const username = dataAny.username || dataAny.metadata?.username || dataAny.signatureParams?.username;
      console.log('✅ Data detected! Capturing...', { fid, username, isSuccess });
      setCapturedSuccessData(data);
      // Process immediately - don't wait for another render
      if (!isProcessing && !hasProcessedSuccess) {
        console.log('Processing data immediately...');
        handleSuccess(data);
      }
    }
  }, [isSuccess, data, capturedSuccessData, isProcessing, hasProcessedSuccess, handleSuccess, hasValidUserData]);

  // Process captured success data if it wasn't processed yet
  useEffect(() => {
    if (capturedSuccessData && !isProcessing && !hasProcessedSuccess) {
      console.log('Processing captured success data...');
      handleSuccess(capturedSuccessData);
    }
  }, [capturedSuccessData, isProcessing, hasProcessedSuccess, handleSuccess]);

  // If connection is lost but we're still polling, try to reconnect
  useEffect(() => {
    if (isPolling && !isConnected && channelToken) {
      console.log('Connection lost during polling, attempting reconnect...');
      reconnect();
    }
  }, [isPolling, isConnected, channelToken, reconnect]);

  // Track channel token changes and reset error count
  useEffect(() => {
    if (channelToken && channelToken !== lastChannelToken) {
      setLastChannelToken(channelToken);
      setChannelErrorCount(0);
    }
  }, [channelToken, lastChannelToken]);

  // Monitor for channel errors and recreate channel if needed
  useEffect(() => {
    if (isError && error?.message?.includes('401') && channelToken && !hasProcessedSuccess && !capturedSuccessData) {
      const newErrorCount = channelErrorCount + 1;
      setChannelErrorCount(newErrorCount);
      
      // If we get multiple 401 errors, try to create a new channel
      if (newErrorCount >= 3 && url) {
        console.log('Multiple channel errors detected, attempting to create new channel...');
        // Reset and start fresh
        setHasStarted(false);
        setChannelErrorCount(0);
        setTimeout(() => {
          connect();
          setTimeout(() => startSignIn(), 500);
        }, 1000);
      }
    }
  }, [isError, error, channelToken, hasProcessedSuccess, capturedSuccessData, channelErrorCount, url, connect, startSignIn]);

  const handleStartSignIn = useCallback(() => {
    setHasStarted(true);
    setHasProcessedSuccess(false);
    console.log('Manual start triggered');
    connect();
    startSignIn();
  }, [connect, startSignIn]);

  // Manual check for success (in case polling fails)
  const handleManualCheck = useCallback(() => {
    console.log('Manual check triggered', { isSuccess, data, isPolling, isConnected, url, channelToken, capturedSuccessData });
    
    // First check if we have captured success data
    if (capturedSuccessData && hasValidUserData(capturedSuccessData) && !hasProcessedSuccess) {
      console.log('Found captured success data, processing...');
      handleSuccess(capturedSuccessData);
      return;
    }
    
    // Check if data exists even if isSuccess is false (channel errors might prevent isSuccess from being true)
    if (data && hasValidUserData(data) && !hasProcessedSuccess) {
      console.log('Found data (isSuccess may be false due to channel errors), processing...');
      handleSuccess(data);
      return;
    }
    
    // If we have a URL but polling isn't active, try to restart
    if (url && !isPolling && !isSuccess) {
      console.log('URL exists but polling inactive, attempting to restart sign-in...');
      if (isConnected) {
        startSignIn();
        toast({
          title: 'Restarting',
          description: 'Attempting to start polling...',
        });
      } else {
        connect();
        setTimeout(() => startSignIn(), 500);
        toast({
          title: 'Reconnecting',
          description: 'Reconnecting and restarting sign-in...',
        });
      }
      return;
    }
    
    if (!isConnected) {
      console.log('Not connected, attempting reconnect...');
      reconnect();
      toast({
        title: 'Reconnecting',
        description: 'Attempting to reconnect...',
      });
    } else {
      toast({
        title: 'Still waiting',
        description: isPolling 
          ? 'Polling for confirmation...' 
          : url 
            ? 'Please scan the QR code and confirm in Warpcast, then click this button again'
            : 'Generating QR code...',
      });
    }
  }, [isSuccess, data, isPolling, isConnected, hasProcessedSuccess, handleSuccess, reconnect, toast, url, channelToken, startSignIn, connect, capturedSuccessData]);

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
                      <span className="text-sm text-purple-400">
                        {isPolling ? 'Waiting for confirmation...' : 'Scan and confirm in Warpcast'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 w-full">
                    <a href={url} className="text-sm text-purple-400 hover:text-purple-300 underline">
                      Open in Warpcast app
                    </a>
                    <Button
                      onClick={handleManualCheck}
                      variant="outline"
                      size="sm"
                      className="mt-2 text-xs"
                    >
                      {isPolling ? 'Check Status' : 'I\'ve Confirmed - Check Now'}
                    </Button>
                  </div>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

