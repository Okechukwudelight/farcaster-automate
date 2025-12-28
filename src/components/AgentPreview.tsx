import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Users, MessageSquare, Heart, RefreshCw, Clock, 
  Sparkles, Target, TrendingUp, AlertTriangle, Lightbulb,
  Calendar, Loader2, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface AgentPreviewProps {
  profile: UserProfile | null;
  casts: Cast[];
  analysis: AgentAnalysis | null;
  isLoadingProfile: boolean;
  isLoadingAnalysis: boolean;
  error: string | null;
}

function SimulationBadge() {
  return (
    <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 gap-1">
      <Eye className="h-3 w-3" />
      Read-Only Simulation
    </Badge>
  );
}

function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <Card className="glass border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <img 
            src={profile.pfpUrl} 
            alt={profile.displayName}
            className="w-16 h-16 rounded-full border-2 border-primary/30"
          />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{profile.displayName}</CardTitle>
            <CardDescription className="text-primary">@{profile.username}</CardDescription>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {profile.followerCount.toLocaleString()} followers
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {profile.followingCount.toLocaleString()} following
              </span>
            </div>
          </div>
        </div>
        {profile.bio && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{profile.bio}</p>
        )}
      </CardHeader>
    </Card>
  );
}

function RecentCastsCard({ casts }: { casts: Cast[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayCasts = expanded ? casts : casts.slice(0, 3);

  return (
    <Card className="glass border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Recent Casts
          </CardTitle>
          <Badge variant="secondary" className="text-xs">{casts.length} casts</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayCasts.map((cast, i) => (
          <motion.div 
            key={cast.hash}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-3 rounded-lg bg-secondary/30 border border-border/30"
          >
            <p className="text-sm text-foreground/90 line-clamp-2">{cast.text}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" /> {cast.likes}
              </span>
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> {cast.recasts}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {cast.replies}
              </span>
              <span className="ml-auto">
                {new Date(cast.timestamp).toLocaleDateString()}
              </span>
            </div>
          </motion.div>
        ))}
        {casts.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors py-2"
          >
            {expanded ? (
              <>Show Less <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Show {casts.length - 3} More <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestedPostsCard({ posts }: { posts: AgentAnalysis['suggestedPosts'] }) {
  return (
    <Card className="glass border-border/50 border-l-4 border-l-green-500/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-green-400" />
            Suggested Post Drafts
          </CardTitle>
          <SimulationBadge />
        </div>
        <CardDescription>AI-generated posts matching the user's style</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {posts.map((post, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-3 rounded-lg bg-green-500/5 border border-green-500/20"
          >
            <p className="text-sm text-foreground font-medium">"{post.content}"</p>
            <p className="text-xs text-muted-foreground mt-2 italic">{post.reasoning}</p>
            <Badge 
              variant="outline" 
              className={`mt-2 text-xs ${
                post.expectedEngagement === 'high' 
                  ? 'border-green-500/50 text-green-400' 
                  : post.expectedEngagement === 'medium'
                  ? 'border-amber-500/50 text-amber-400'
                  : 'border-gray-500/50 text-gray-400'
              }`}
            >
              Expected: {post.expectedEngagement} engagement
            </Badge>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}

function SuggestedActionsCard({ likes, recasts }: { likes: AgentAnalysis['suggestedLikes']; recasts: AgentAnalysis['suggestedRecasts'] }) {
  return (
    <Card className="glass border-border/50 border-l-4 border-l-primary/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Suggested Engagement Actions
          </CardTitle>
          <SimulationBadge />
        </div>
        <CardDescription>Recommended likes and recasts for growth</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
            <Heart className="h-3.5 w-3.5 text-destructive" />
            Topics to Like
          </h4>
          <div className="space-y-2">
            {likes.map((like, i) => (
              <div key={i} className="p-2 rounded bg-destructive/5 border border-destructive/20 text-sm">
                <span className="font-medium text-destructive">{like.topic}</span>
                <p className="text-xs text-muted-foreground mt-1">{like.reason}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
            <RefreshCw className="h-3.5 w-3.5 text-green-400" />
            Content to Recast
          </h4>
          <div className="space-y-2">
            {recasts.map((recast, i) => (
              <div key={i} className="p-2 rounded bg-green-500/5 border border-green-500/20 text-sm">
                <span className="font-medium text-green-400">{recast.type}</span>
                <p className="text-xs text-muted-foreground mt-1">{recast.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PostingTimesCard({ patterns }: { patterns: AgentAnalysis['postingPatterns'] }) {
  return (
    <Card className="glass border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-400" />
          Optimal Posting Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h4 className="text-xs text-muted-foreground mb-2">Best Times</h4>
          <div className="flex flex-wrap gap-2">
            {patterns.bestTimes.map((time, i) => (
              <Badge key={i} variant="secondary" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                {time}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs text-muted-foreground mb-2">Best Days</h4>
          <div className="flex flex-wrap gap-2">
            {patterns.bestDays.map((day, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                {day}
              </Badge>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Average frequency: {patterns.averagePostFrequency}
        </p>
      </CardContent>
    </Card>
  );
}

function StrategyCard({ strategy, insights }: { strategy: AgentAnalysis['agentStrategy']; insights: AgentAnalysis['audienceInsights'] }) {
  return (
    <Card className="glass border-border/50 border-l-4 border-l-amber-500/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          Agent Strategy Recommendation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm font-medium text-amber-200">{strategy.focus}</p>
        </div>
        
        <div>
          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-green-400" />
            Recommended Actions
          </h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {strategy.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                {action}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            Cautions
          </h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {strategy.cautions.map((caution, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-400 mt-1">•</span>
                {caution}
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-2 border-t border-border/30">
          <h4 className="text-xs text-muted-foreground mb-2">Target Audience</h4>
          <p className="text-sm">{insights.targetAudience}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentPreview({ 
  profile, 
  casts, 
  analysis, 
  isLoadingProfile, 
  isLoadingAnalysis,
  error 
}: AgentPreviewProps) {
  if (error) {
    return (
      <Card className="glass border-destructive/50">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoadingProfile) {
    return (
      <Card className="glass border-border/50">
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Fetching Farcaster profile...</p>
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Header Banner */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-medium text-amber-200">Phase 1: AI Agent Preview</span>
        </div>
        <Badge variant="outline" className="border-amber-500/50 text-amber-400 text-xs">
          Read-Only Mode
        </Badge>
      </div>

      {/* Profile Section */}
      <ProfileCard profile={profile} />

      {/* Recent Casts */}
      {casts.length > 0 && <RecentCastsCard casts={casts} />}

      {/* AI Analysis Loading */}
      {isLoadingAnalysis && (
        <Card className="glass border-border/50">
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">AI analyzing profile and generating recommendations...</p>
            <p className="text-xs text-muted-foreground mt-1">This may take a few seconds</p>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Results */}
      <AnimatePresence>
        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Content Themes */}
            <Card className="glass border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Content Themes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {analysis.contentThemes.map((theme, i) => (
                    <Badge key={i} variant="secondary">{theme}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Suggested Posts */}
            <SuggestedPostsCard posts={analysis.suggestedPosts} />

            {/* Suggested Actions */}
            <SuggestedActionsCard likes={analysis.suggestedLikes} recasts={analysis.suggestedRecasts} />

            {/* Posting Times */}
            <PostingTimesCard patterns={analysis.postingPatterns} />

            {/* Strategy */}
            <StrategyCard strategy={analysis.agentStrategy} insights={analysis.audienceInsights} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
