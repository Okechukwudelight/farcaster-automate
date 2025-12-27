import { useState, useEffect } from 'react';
import { Bot, Play, Loader2, Settings, Zap, RefreshCw, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFarcaster } from '@/hooks/useFarcaster';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

interface Agent {
  id: string;
  name: string;
  keywords: string[];
  accounts: string[];
  action_type: 'like' | 'recast' | 'both';
  is_active: boolean;
}

interface AgentBuilderProps {
  onAgentRun: (results: any[]) => void;
}

export function AgentBuilder({ onAgentRun }: AgentBuilderProps) {
  const { user } = useAuth();
  const farcaster = useFarcaster();
  const { toast } = useToast();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const [formData, setFormData] = useState({
    name: 'My Agent',
    keywords: '',
    accounts: '',
    enableLike: true,
    enableRecast: true,
    isActive: true,
  });

  // Load existing agent
  useEffect(() => {
    if (!user) return;

    const loadAgent = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setAgent(data as Agent);
        setFormData({
          name: data.name,
          keywords: (data.keywords || []).join(', '),
          accounts: (data.accounts || []).join(', '),
          enableLike: data.action_type === 'like' || data.action_type === 'both',
          enableRecast: data.action_type === 'recast' || data.action_type === 'both',
          isActive: data.is_active,
        });
      }
      setIsLoading(false);
    };

    loadAgent();
  }, [user]);

  const getActionType = (): 'like' | 'recast' | 'both' => {
    if (formData.enableLike && formData.enableRecast) return 'both';
    if (formData.enableLike) return 'like';
    return 'recast';
  };

  const handleSave = async () => {
    if (!user) return;

    setIsLoading(true);

    const keywords = formData.keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const accounts = formData.accounts
      .split(',')
      .map(a => a.trim().replace('@', ''))
      .filter(a => a.length > 0);

    const agentData = {
      user_id: user.id,
      name: formData.name,
      keywords,
      accounts,
      action_type: getActionType(),
      is_active: formData.isActive,
    };

    let result;
    if (agent) {
      result = await supabase
        .from('agents')
        .update(agentData)
        .eq('id', agent.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('agents')
        .insert(agentData)
        .select()
        .single();
    }

    if (result.error) {
      toast({
        title: 'Error',
        description: 'Failed to save agent configuration',
        variant: 'destructive',
      });
    } else {
      setAgent(result.data as Agent);
      toast({
        title: 'Saved',
        description: 'Agent configuration saved successfully',
      });
    }

    setIsLoading(false);
  };

  const handleRun = async () => {
    if (!farcaster.isConnected || !farcaster.user?.signerUuid) {
      toast({
        title: 'Connect Farcaster',
        description: 'Please connect your Farcaster account first',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.enableLike && !formData.enableRecast) {
      toast({
        title: 'Select an action',
        description: 'Enable at least one action (like or recast)',
        variant: 'destructive',
      });
      return;
    }

    setIsRunning(true);

    try {
      // Fetch feed with filters
      const keywords = formData.keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const accounts = formData.accounts
        .split(',')
        .map(a => a.trim().replace('@', ''))
        .filter(a => a.length > 0);

      const { data: feedData, error: feedError } = await supabase.functions.invoke('farcaster-actions', {
        body: {
          action: 'fetch_feed',
          keywords,
          accounts,
          limit: 10,
        },
      });

      if (feedError) throw feedError;

      const casts = feedData.casts || [];
      
      if (casts.length === 0) {
        toast({
          title: 'No matching casts',
          description: 'No casts found matching your criteria',
        });
        setIsRunning(false);
        return;
      }

      // Perform actions on matching casts
      const results: any[] = [];
      const actionType = getActionType();

      for (const cast of casts.slice(0, 5)) { // Limit to 5 actions
        if (actionType === 'like' || actionType === 'both') {
          const { data, error } = await supabase.functions.invoke('farcaster-actions', {
            body: {
              action: 'like',
              signerUuid: farcaster.user.signerUuid,
              castHash: cast.hash,
            },
          });

          const logResult = {
            action_type: 'like' as const,
            cast_hash: cast.hash,
            cast_author: cast.author.username,
            cast_text: cast.text?.slice(0, 200),
            status: error || !data?.success ? 'failed' : 'success',
            error_message: error?.message || data?.error,
          };

          results.push(logResult);

          // Save to action_logs
          if (agent && user) {
            await supabase.from('action_logs').insert({
              agent_id: agent.id,
              user_id: user.id,
              ...logResult,
            });
          }
        }

        if (actionType === 'recast' || actionType === 'both') {
          const { data, error } = await supabase.functions.invoke('farcaster-actions', {
            body: {
              action: 'recast',
              signerUuid: farcaster.user.signerUuid,
              castHash: cast.hash,
            },
          });

          const logResult = {
            action_type: 'recast' as const,
            cast_hash: cast.hash,
            cast_author: cast.author.username,
            cast_text: cast.text?.slice(0, 200),
            status: error || !data?.success ? 'failed' : 'success',
            error_message: error?.message || data?.error,
          };

          results.push(logResult);

          // Save to action_logs
          if (agent && user) {
            await supabase.from('action_logs').insert({
              agent_id: agent.id,
              user_id: user.id,
              ...logResult,
            });
          }
        }
      }

      onAgentRun(results);

      toast({
        title: 'Agent run complete',
        description: `Performed ${results.length} actions`,
      });
    } catch (error: any) {
      console.error('Agent run error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run agent',
        variant: 'destructive',
      });
    }

    setIsRunning(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="glass border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-primary">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">Agent Configuration</CardTitle>
                <CardDescription>Define rules for automated actions</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
              />
              <span className="text-sm text-muted-foreground">
                {formData.isActive ? 'Active' : 'Paused'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="My Agent"
              className="bg-secondary/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords (comma-separated)</Label>
            <Textarea
              id="keywords"
              value={formData.keywords}
              onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
              placeholder="base, onchain, crypto, web3"
              className="bg-secondary/50 min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Agent will match casts containing these keywords
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accounts">Accounts to Monitor (comma-separated)</Label>
            <Input
              id="accounts"
              value={formData.accounts}
              onChange={(e) => setFormData(prev => ({ ...prev, accounts: e.target.value }))}
              placeholder="@vitalik, @jessepollak, @dwr"
              className="bg-secondary/50"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to search all trending casts
            </p>
          </div>

          <div className="space-y-4">
            <Label>Actions</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border/50 cursor-pointer hover:bg-secondary/80 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.enableLike}
                  onChange={(e) => setFormData(prev => ({ ...prev, enableLike: e.target.checked }))}
                  className="sr-only"
                />
                <div className={`p-2 rounded-md ${formData.enableLike ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                  <Heart className="h-4 w-4" />
                </div>
                <span className={`text-sm font-medium ${formData.enableLike ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Like
                </span>
              </label>

              <label className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border/50 cursor-pointer hover:bg-secondary/80 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.enableRecast}
                  onChange={(e) => setFormData(prev => ({ ...prev, enableRecast: e.target.checked }))}
                  className="sr-only"
                />
                <div className={`p-2 rounded-md ${formData.enableRecast ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                  <RefreshCw className="h-4 w-4" />
                </div>
                <span className={`text-sm font-medium ${formData.enableRecast ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Recast
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={isLoading}
              variant="outline"
              className="flex-1"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Settings className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>

            <Button
              onClick={handleRun}
              disabled={isRunning || !farcaster.isConnected}
              className="flex-1 bg-gradient-primary hover:opacity-90"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Agent
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
