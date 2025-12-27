import { useState, useEffect } from 'react';
import { Play, Loader2, Settings, RefreshCw, Heart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFarcaster } from '@/hooks/useFarcaster';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

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

interface ChipProps {
  label: string;
  onRemove: () => void;
}

function Chip({ label, onRemove }: ChipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/50 border border-border/50 text-sm"
    >
      <span className="text-foreground">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
      </button>
    </motion.div>
  );
}

export function AgentBuilder({ onAgentRun }: AgentBuilderProps) {
  const { user } = useAuth();
  const farcaster = useFarcaster();
  const { toast } = useToast();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [keywords, setKeywords] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [accountInput, setAccountInput] = useState('');
  
  // Autocomplete state removed - requires paid Neynar plan

  const [formData, setFormData] = useState({
    name: 'My Agent',
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
          enableLike: data.action_type === 'like' || data.action_type === 'both',
          enableRecast: data.action_type === 'recast' || data.action_type === 'both',
          isActive: data.is_active,
        });
        setKeywords(data.keywords || []);
        setAccounts(data.accounts || []);
      }
      setIsLoading(false);
    };

    loadAgent();
  }, [user]);

  // Username autocomplete disabled - requires paid Neynar plan
  // Users can type usernames manually and add them with Enter or Add button


  const getActionType = (): 'like' | 'recast' | 'both' => {
    if (formData.enableLike && formData.enableRecast) return 'both';
    if (formData.enableLike) return 'like';
    return 'recast';
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
  };

  const handleAddAccount = (username?: string) => {
    const value = username || accountInput.trim().replace('@', '');
    const trimmed = value.trim();
    if (trimmed && !accounts.includes(trimmed)) {
      setAccounts([...accounts, trimmed]);
      setAccountInput('');
    }
  };

  const handleRemoveAccount = (account: string) => {
    setAccounts(accounts.filter(a => a !== account));
  };

  const handleKeywordKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleAccountKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAccount();
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    setFormData(prev => ({ ...prev, isActive: checked }));
    
    // Auto-save when toggle changes
    if (agent && user) {
      setIsSaving(true);
      const agentData = {
        user_id: user.id,
        name: formData.name,
        keywords,
        accounts,
        action_type: getActionType(),
        is_active: checked,
      };

      const { error } = await supabase
        .from('agents')
        .update(agentData)
        .eq('id', agent.id);

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to update agent status',
          variant: 'destructive',
        });
        // Revert on error
        setFormData(prev => ({ ...prev, isActive: !checked }));
      } else {
        setAgent({ ...agent, is_active: checked });
        toast({
          title: checked ? 'Agent Activated' : 'Agent Paused',
          description: `Agent is now ${checked ? 'active' : 'paused'}`,
        });
      }
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);

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

    setIsSaving(false);
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

    if (keywords.length === 0 && accounts.length === 0) {
      toast({
        title: 'Add filters',
        description: 'Add at least one keyword or account to monitor',
        variant: 'destructive',
      });
      return;
    }

    setIsRunning(true);

    try {
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

      for (const cast of casts.slice(0, 5)) {
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
      <Card className="glass border-border/50 w-full overflow-hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">Agent Configuration</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Define rules for automated actions</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Switch
                checked={formData.isActive}
                onCheckedChange={handleToggleActive}
                disabled={isSaving || !agent}
              />
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
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
            <Label htmlFor="keywords">Keywords</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="keywords"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordKeyPress}
                  placeholder="Type keyword and press Enter or comma"
                  className="bg-secondary/50 flex-1"
                />
                <Button
                  type="button"
                  onClick={handleAddKeyword}
                  disabled={!keywordInput.trim()}
                  variant="outline"
                  size="sm"
                >
                  Add
                </Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-secondary/30 border border-border/30 min-h-[40px]">
                  <AnimatePresence>
                    {keywords.map((keyword) => (
                      <Chip
                        key={keyword}
                        label={keyword}
                        onRemove={() => handleRemoveKeyword(keyword)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Agent will match casts containing these keywords
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accounts">Accounts to Monitor</Label>
            <div className="space-y-2 relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="accounts"
                    value={accountInput}
                    onChange={(e) => setAccountInput(e.target.value)}
                    onKeyDown={handleAccountKeyPress}
                    placeholder="@username (type and press Enter)"
                    className="bg-secondary/50 flex-1"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => handleAddAccount()}
                  disabled={!accountInput.trim()}
                  variant="outline"
                  size="sm"
                >
                  Add
                </Button>
              </div>
              {accounts.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-secondary/30 border border-border/30 min-h-[40px]">
                  <AnimatePresence>
                    {accounts.map((account) => (
                      <Chip
                        key={account}
                        label={`@${account}`}
                        onRemove={() => handleRemoveAccount(account)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty to search all trending casts
            </p>
          </div>

          <div className="space-y-4">
            <Label>Actions</Label>
            <div className="flex gap-2 sm:gap-4 flex-wrap">
              <label className="flex items-center gap-2 p-2 sm:p-3 rounded-lg bg-secondary/50 border border-border/50 cursor-pointer hover:bg-secondary/80 transition-colors flex-1 min-w-[120px]">
                <input
                  type="checkbox"
                  checked={formData.enableLike}
                  onChange={(e) => setFormData(prev => ({ ...prev, enableLike: e.target.checked }))}
                  className="sr-only"
                />
                <div className={`p-1.5 sm:p-2 rounded-md flex-shrink-0 ${formData.enableLike ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                  <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
                </div>
                <span className={`text-xs sm:text-sm font-medium ${formData.enableLike ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Like
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 sm:p-3 rounded-lg bg-secondary/50 border border-border/50 cursor-pointer hover:bg-secondary/80 transition-colors flex-1 min-w-[120px]">
                <input
                  type="checkbox"
                  checked={formData.enableRecast}
                  onChange={(e) => setFormData(prev => ({ ...prev, enableRecast: e.target.checked }))}
                  className="sr-only"
                />
                <div className={`p-1.5 sm:p-2 rounded-md flex-shrink-0 ${formData.enableRecast ? 'bg-green-400/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />
                </div>
                <span className={`text-xs sm:text-sm font-medium ${formData.enableRecast ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Recast
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              variant="outline"
              className="flex-1 text-xs sm:text-sm"
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin sm:mr-2" />
              ) : (
                <Settings className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              )}
              Save
            </Button>

            <Button
              onClick={handleRun}
              disabled={isRunning || !farcaster.isConnected}
              className="flex-1 bg-gradient-primary hover:opacity-90 text-xs sm:text-sm"
              title={!farcaster.isConnected ? 'Connect Farcaster first' : !farcaster.user?.signerUuid ? 'Signer required (paid Neynar plan)' : ''}
            >
              {isRunning ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin sm:mr-2" />
              ) : (
                <Play className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              )}
              Run Agent
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
