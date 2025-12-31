import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Send, AlertCircle, Loader2, CreditCard, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

// Stablecoin contract addresses on Base mainnet
const STABLECOINS: Record<string, { address: string; decimals: number; name: string }> = {
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    name: 'USD Coin',
  },
  DAI: {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
    name: 'Dai Stablecoin',
  },
  USDbC: {
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    decimals: 6,
    name: 'USD Base Coin',
  },
};

export function RemittanceSender() {
  const { user } = useAuth();
  const { address, isConnected, isOnBase, switchToBase } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDC');
  const [isSending, setIsSending] = useState(false);
  const [showOnramp, setShowOnramp] = useState(false);

  const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

  // Coinbase Onramp URL - using the public widget without appId
  const getOnrampUrl = () => {
    // Use Coinbase's public onramp that doesn't require appId registration
    const params = new URLSearchParams({
      addresses: JSON.stringify({ [address || '']: ['base'] }),
      assets: JSON.stringify(['USDC', 'DAI']),
    });
    return `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
  };

  const handleSend = async () => {
    if (!user || !address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!isValidAddress(recipient)) {
      toast.error('Please enter a valid Base wallet address');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!isOnBase) {
      toast.error('Please switch to Base network first');
      return;
    }

    setIsSending(true);

    // Create pending transaction record
    const { data: txRecord, error: insertError } = await supabase
      .from('remittance_transactions')
      .insert({
        user_id: user.id,
        sender_address: address,
        recipient_address: recipient,
        amount: parseFloat(amount),
        currency,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create transaction record:', insertError);
      toast.error('Failed to initiate transaction');
      setIsSending(false);
      return;
    }

    try {
      const stablecoin = STABLECOINS[currency];
      const decimals = stablecoin.decimals;
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 10 ** decimals));

      // Encode transfer function call
      const transferData = encodeTransferData(recipient, amountInWei);

      // Send transaction via wallet
      const provider = window.ethereum;
      if (!provider) throw new Error('No wallet provider found');

      // Estimate gas first, then add a buffer
      let gasLimit: string;
      try {
        const gasEstimate = await provider.request({
          method: 'eth_estimateGas',
          params: [
            {
              from: address,
              to: stablecoin.address,
              data: transferData,
            },
          ],
        });
        // Add 20% buffer to gas estimate
        const gasWithBuffer = BigInt(gasEstimate as string) * 120n / 100n;
        gasLimit = '0x' + gasWithBuffer.toString(16);
      } catch (gasError) {
        console.warn('Gas estimation failed, using default:', gasError);
        // Default gas limit for ERC20 transfers
        gasLimit = '0x15F90'; // 90,000 gas
      }

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: address,
            to: stablecoin.address,
            data: transferData,
            gas: gasLimit,
          },
        ],
      });

      // Update transaction record with hash and success status
      await supabase
        .from('remittance_transactions')
        .update({
          tx_hash: txHash,
          status: 'success',
        })
        .eq('id', txRecord.id);

      toast.success('Transaction sent successfully!', {
        description: `Sent ${amount} ${currency} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
      });

      // Reset form
      setRecipient('');
      setAmount('');
    } catch (error: any) {
      console.error('Transaction failed:', error);

      // Update transaction record with failure
      await supabase
        .from('remittance_transactions')
        .update({
          status: 'failed',
          error_message: error.message || 'Transaction failed',
        })
        .eq('id', txRecord.id);

      toast.error('Transaction failed', {
        description: error.message || 'Please try again',
      });
    } finally {
      setIsSending(false);
    }
  };

  // Encode ERC20 transfer function call
  const encodeTransferData = (to: string, amount: bigint): string => {
    // Function selector for transfer(address,uint256)
    const selector = '0xa9059cbb';
    // Pad address to 32 bytes
    const paddedAddress = to.slice(2).padStart(64, '0');
    // Pad amount to 32 bytes
    const paddedAmount = amount.toString(16).padStart(64, '0');
    return selector + paddedAddress + paddedAmount;
  };

  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Send Remittance
            </CardTitle>
            <CardDescription>
              Connect your wallet from the Dashboard to send remittances
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-6">
              Please connect your wallet in the Dashboard first to use remittance features.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Send Remittance
          </CardTitle>
          <CardDescription>
            Send stablecoins securely on Base network
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isOnBase ? (
            <div className="text-center py-6">
              <AlertCircle className="h-12 w-12 mx-auto text-warning mb-4" />
              <p className="text-muted-foreground mb-4">Please switch to Base network</p>
              <Button onClick={switchToBase} className="bg-gradient-primary">
                Switch to Base
              </Button>
            </div>
          ) : (
            <>
              {/* Fiat On-Ramp Section */}
              <div className="border border-border/50 rounded-lg p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Need stablecoins?</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(getOnrampUrl(), '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Buy with Card
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Purchase USDC or DAI directly with your credit/debit card via Coinbase
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient Address</Label>
                <Input
                  id="recipient"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="font-mono"
                />
                {recipient && !isValidAddress(recipient) && (
                  <p className="text-xs text-destructive">Invalid wallet address</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STABLECOINS).map(([symbol, info]) => (
                        <SelectItem key={symbol} value={symbol}>
                          {symbol} - {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleSend}
                  disabled={isSending || !recipient || !amount || !isValidAddress(recipient)}
                  className="w-full bg-gradient-primary hover:opacity-90"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send {currency}
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Sending from: {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
