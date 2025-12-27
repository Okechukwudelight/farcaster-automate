import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Loader2, Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { z } from 'zod';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const wallet = useWallet();
  const { toast } = useToast();

  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  // Farcaster lookup
  const [showFarcasterDialog, setShowFarcasterDialog] = useState(false);
  const [farcasterUsername, setFarcasterUsername] = useState('');
  const [isLookingUpFarcaster, setIsLookingUpFarcaster] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    if (error) {
      let message = error.message;
      if (message.includes('already registered')) {
        message = 'This email is already registered. Please sign in instead.';
      } else if (message.includes('Invalid login credentials')) {
        message = 'Invalid email or password. Please try again.';
      }

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: isSignUp ? 'Account created' : 'Welcome back',
        description: isSignUp ? 'Your account has been created successfully' : 'You have been signed in',
      });
      navigate('/');
    }

    setIsLoading(false);
  };

  const handleWalletConnect = async (type: 'metamask' | 'coinbase') => {
    const walletName = type === 'coinbase' ? 'Coinbase Wallet' : 'MetaMask';
    
    // Check if wallet extension exists
    if (!window.ethereum) {
      toast({
        title: `${walletName} Not Found`,
        description: `Please install ${walletName} extension to continue`,
        variant: 'destructive',
      });
      window.open(
        type === 'coinbase' 
          ? 'https://www.coinbase.com/wallet' 
          : 'https://metamask.io/download/',
        '_blank'
      );
      return;
    }

    try {
      await wallet.connect(type);
      
      // Check for error in wallet state
      if (wallet.error) {
        toast({
          title: 'Connection Failed',
          description: wallet.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Wallet Connected',
        description: `${walletName} connected successfully`,
      });
    } catch (error: any) {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect wallet',
        variant: 'destructive',
      });
    }
  };

  const handleFarcasterConnect = () => {
    setShowFarcasterDialog(true);
  };

  const lookupFarcasterUser = async () => {
    if (!farcasterUsername.trim()) {
      toast({
        title: 'Enter username',
        description: 'Please enter your Farcaster username',
        variant: 'destructive',
      });
      return;
    }

    setIsLookingUpFarcaster(true);

    try {
      // Lookup user by username (free API)
      const username = farcasterUsername.replace('@', '').trim();
      
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/by_username?username=${username}`, {
        headers: {
          'api_key': 'NEYNAR_API_DOCS', // Public demo key for user lookup
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'User not found');
      }

      const userData = await response.json();
      const user = userData.user;

      if (!user) {
        throw new Error('Farcaster user not found');
      }

      toast({
        title: 'Farcaster User Found',
        description: `Found @${user.username}. Sign in or create an account to complete setup.`,
      });

      // Store the user info temporarily
      sessionStorage.setItem('pendingFarcasterUser', JSON.stringify({
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
      }));

      setShowFarcasterDialog(false);
    } catch (error: any) {
      console.error('Farcaster lookup error:', error);
      toast({
        title: 'User Not Found',
        description: error.message || 'Could not find that Farcaster user',
        variant: 'destructive',
      });
    }

    setIsLookingUpFarcaster(false);
  };

  const pendingFarcaster = sessionStorage.getItem('pendingFarcasterUser');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
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
        className="w-full max-w-md relative z-10"
      >
        <Card className="glass border-border/50 shadow-2xl backdrop-blur-xl">
          <CardHeader className="text-center space-y-6 pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="flex justify-center"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-primary rounded-3xl blur-2xl opacity-60 group-hover:opacity-80 transition-opacity" />
                <div className="relative bg-gradient-primary p-5 rounded-3xl shadow-lg">
                  <Bot className="h-12 w-12 text-white" />
                </div>
                <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-yellow-400 animate-pulse" />
              </div>
            </motion.div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold tracking-tight">
                <span className="text-gradient">FarAgent</span>
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                {isSignUp ? 'Create your account to get started' : 'Welcome back, agent'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* Wallet & Farcaster Connect Options */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleWalletConnect('metamask')}
                disabled={wallet.isConnecting}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border/50 hover:bg-secondary hover:border-orange-500/30 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <img 
                      src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" 
                      alt="MetaMask"
                      className="w-6 h-6"
                    />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-foreground">Continue with MetaMask</p>
                    <p className="text-xs text-muted-foreground">Connect your MetaMask wallet</p>
                  </div>
                </div>
                {wallet.isConnecting ? (
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleWalletConnect('coinbase')}
                disabled={wallet.isConnecting}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border/50 hover:bg-secondary hover:border-blue-500/30 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <svg viewBox="0 0 48 48" className="w-6 h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="24" cy="24" r="24" fill="#0052FF"/>
                      <path d="M24 10C16.268 10 10 16.268 10 24s6.268 14 14 14 14-6.268 14-14S31.732 10 24 10zm-4.2 17.5a3.5 3.5 0 1 1 0-7h8.4a3.5 3.5 0 1 1 0 7h-8.4z" fill="#fff"/>
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-foreground">Continue with Coinbase</p>
                    <p className="text-xs text-muted-foreground">Connect Coinbase Wallet</p>
                  </div>
                </div>
                {wallet.isConnecting ? (
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                )}
              </button>

              <button
                type="button"
                onClick={handleFarcasterConnect}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border/50 hover:bg-secondary hover:border-purple-500/30 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <svg viewBox="0 0 1000 1000" className="w-6 h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="1000" height="1000" rx="200" fill="#8A63D2"/>
                      <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" fill="white"/>
                      <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V351.111H331.111L360 253.333H128.889Z" fill="white"/>
                      <path d="M640 253.333L668.889 351.111H693.333V746.667C681.06 746.667 671.111 756.616 671.111 768.889V795.556H666.667C654.394 795.556 644.444 805.505 644.444 817.778V844.444H893.333V817.778C893.333 805.505 883.384 795.556 871.111 795.556H866.667V768.889C866.667 756.616 856.717 746.667 844.444 746.667H817.778V351.111H842.222L871.111 253.333H640Z" fill="white"/>
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-foreground">Continue with Farcaster</p>
                    <p className="text-xs text-muted-foreground">
                      {pendingFarcaster ? 'Signer ready - complete signup below' : 'Sign in with your Farcaster account'}
                    </p>
                  </div>
                </div>
                {pendingFarcaster ? (
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                ) : (
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
                )}
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

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full bg-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground">or continue with email</span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-secondary/50 border-border/50 focus:border-primary h-12 text-foreground placeholder:text-muted-foreground"
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-secondary/50 border-border/50 focus:border-primary h-12 text-foreground placeholder:text-muted-foreground"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  />
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-gradient-primary text-white font-semibold shadow-lg hover:opacity-90 transition-all duration-300"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : null}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isSignUp
                  ? 'Already have an account? '
                  : "Don't have an account? "}
                <span className="text-primary font-medium hover:underline">
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </span>
              </button>
            </div>
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

      {/* Farcaster Username Dialog */}
      <Dialog open={showFarcasterDialog} onOpenChange={setShowFarcasterDialog}>
        <DialogContent className="glass border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg viewBox="0 0 1000 1000" className="w-6 h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="1000" height="1000" rx="200" fill="#8A63D2"/>
                <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" fill="white"/>
                <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V351.111H331.111L360 253.333H128.889Z" fill="white"/>
                <path d="M640 253.333L668.889 351.111H693.333V746.667C681.06 746.667 671.111 756.616 671.111 768.889V795.556H666.667C654.394 795.556 644.444 805.505 644.444 817.778V844.444H893.333V817.778C893.333 805.505 883.384 795.556 871.111 795.556H866.667V768.889C866.667 756.616 856.717 746.667 844.444 746.667H817.778V351.111H842.222L871.111 253.333H640Z" fill="white"/>
              </svg>
              Connect Farcaster
            </DialogTitle>
            <DialogDescription>
              Enter your Farcaster username to create a signer for automated actions
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="fc-username">Farcaster Username</Label>
              <Input
                id="fc-username"
                placeholder="@yourname"
                value={farcasterUsername}
                onChange={(e) => setFarcasterUsername(e.target.value)}
                className="bg-secondary/50 border-border/50 h-12"
              />
            </div>
            
            <Button
              onClick={lookupFarcasterUser}
              disabled={isLookingUpFarcaster}
              className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isLookingUpFarcaster ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : null}
              Connect Farcaster
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
