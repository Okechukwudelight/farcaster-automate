import { useState, useEffect } from 'react';
import { Play, Loader2, Settings, RefreshCw, Heart, X, Eye, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { AgentPreview } from './AgentPreview';
import { Badge } from '@/components/ui/badge';

interface UserProfile {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  bio: string;
  followerCount: number;
  followingCount: number;
  verifiedAddresses: string[];
}

interface Cast {
  hash: string;
  text: string;
  timestamp: string;
  likes: number;
  recasts: number;
  replies: number;
}

interface AgentAnalysis {
  contentThemes: string[];
  postingPatterns: {
    bestTimes: string[];
    bestDays: string[];
    averagePostFrequency: string;
  };
  suggestedPosts: Array<{
    content: string;
    reasoning: string;
    expectedEngagement: string;
  }>;
  suggestedLikes: Array<{
    topic: string;
    reason: string;
  }>;
  suggestedRecasts: Array<{
    type: string;
    reason: string;
  }>;
  audienceInsights: {
    targetAudience: string;
    growthOpportunities: string[];
    contentGaps: string[];
  };
  agentStrategy: {
    focus: string;
    actions: string[];
    cautions: string[];
  };
}

interface AgentBuilderProps {
  onAgentRun: (results: any[]) => void;
}

export function AgentBuilder({ onAgentRun }: AgentBuilderProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [usernameInput, setUsernameInput] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [analysis, setAnalysis] = useState<AgentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const username = usernameInput.trim().replace('@', '');
    
    if (!username) {
      toast({
        title: 'Enter a username',
        description: 'Please enter a Farcaster username to analyze',
        variant: 'destructive',
      });
      return;
    }

    // Reset state
    setProfile(null);
    setCasts([]);
    setAnalysis(null);
    setError(null);
    setIsLoadingProfile(true);

    try {
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase.functions.invoke('farcaster-actions', {
        body: {
          action: 'fetch_user_profile',
          username,
        },
      });

      if (profileError) throw profileError;
      if (profileData.error) throw new Error(profileData.error);

      setProfile(profileData);

      // Fetch user casts
      const { data: castsData, error: castsError } = await supabase.functions.invoke('farcaster-actions', {
        body: {
          action: 'fetch_user_casts',
          username,
          limit: 20,
        },
      });

      if (castsError) throw castsError;
      if (castsData.error) throw new Error(castsData.error);

      setCasts(castsData.casts || []);
      setIsLoadingProfile(false);

      // Now run AI analysis
      setIsLoadingAnalysis(true);

      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('agent-analysis', {
        body: {
          profile: profileData,
          casts: castsData.casts || [],
        },
      });

      if (analysisError) throw analysisError;
      if (analysisData.error) throw new Error(analysisData.error);

      setAnalysis(analysisData);

      // Report to parent for action logs
      onAgentRun([{
        action_type: 'analysis',
        cast_hash: 'N/A',
        cast_author: username,
        cast_text: `AI analysis completed for @${username}`,
        status: 'success',
      }]);

      toast({
        title: 'Analysis Complete',
        description: `Generated AI agent preview for @${username}`,
      });

    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Failed to analyze profile');
      toast({
        title: 'Error',
        description: err.message || 'Failed to analyze profile',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingProfile(false);
      setIsLoadingAnalysis(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAnalyze();
    }
  };

  const handleReset = () => {
    setProfile(null);
    setCasts([]);
    setAnalysis(null);
    setError(null);
    setUsernameInput('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-4"
    >
      <Card className="glass border-border/50 w-full overflow-hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Agent Preview
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Phase 1: Read-only simulation for any Farcaster user
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 gap-1 w-fit">
              <Eye className="h-3 w-3" />
              Read-Only Mode
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Farcaster Username</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="vitalik"
                  className="bg-secondary/50 pl-7"
                  disabled={isLoadingProfile || isLoadingAnalysis}
                />
              </div>
              <Button
                onClick={handleAnalyze}
                disabled={!usernameInput.trim() || isLoadingProfile || isLoadingAnalysis}
                className="bg-gradient-primary hover:opacity-90"
              >
                {isLoadingProfile || isLoadingAnalysis ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter any Farcaster username to generate an AI agent simulation
            </p>
          </div>

          {/* Reset button when profile is loaded */}
          {(profile || error) && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear & Start Over
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Results */}
      <AgentPreview
        profile={profile}
        casts={casts}
        analysis={analysis}
        isLoadingProfile={isLoadingProfile}
        isLoadingAnalysis={isLoadingAnalysis}
        error={error}
      />

      {/* Phase 1 Info Card */}
      {!profile && !isLoadingProfile && (
        <Card className="glass border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="py-6">
            <div className="text-center space-y-3">
              <div className="flex justify-center gap-2 mb-4">
                <Badge className="bg-primary/20 text-primary border-primary/30">Phase 1</Badge>
                <Badge variant="outline" className="border-blue-500/50 text-blue-400">Base Network</Badge>
              </div>
              <h3 className="text-lg font-semibold">AI Agent Marketplace Preview</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                This is a read-only preview of what an AI agent could do for any Farcaster account. 
                No write permissions, no signing required. Enter any username to see AI-generated 
                engagement strategies.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <Badge variant="secondary" className="text-xs">✓ Profile Analysis</Badge>
                <Badge variant="secondary" className="text-xs">✓ Cast Analysis</Badge>
                <Badge variant="secondary" className="text-xs">✓ AI Recommendations</Badge>
                <Badge variant="secondary" className="text-xs">✓ Posting Schedule</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
