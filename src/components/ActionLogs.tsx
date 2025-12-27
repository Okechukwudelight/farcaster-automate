import { useEffect, useState } from 'react';
import { Heart, RefreshCw, Clock, CheckCircle, XCircle, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

interface ActionLog {
  id: string;
  action_type: 'like' | 'recast';
  cast_hash: string;
  cast_author: string;
  cast_text: string | null;
  status: 'success' | 'failed';
  error_message: string | null;
  created_at: string;
}

interface ActionLogsProps {
  newActions?: ActionLog[];
}

export function ActionLogs({ newActions }: ActionLogsProps) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadLogs = async () => {
      const { data, error } = await supabase
        .from('action_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setLogs(data as ActionLog[]);
      }
      setIsLoading(false);
    };

    loadLogs();
  }, [user]);

  // Merge new actions with existing logs
  useEffect(() => {
    if (newActions && newActions.length > 0) {
      setLogs(prev => [...newActions, ...prev].slice(0, 50));
    }
  }, [newActions]);

  const getActionIcon = (type: 'like' | 'recast') => {
    if (type === 'like') {
      return <Heart className="h-4 w-4 text-destructive" />;
    }
    return <RefreshCw className="h-4 w-4 text-green-400" />;
  };

  const getStatusIcon = (status: 'success' | 'failed') => {
    if (status === 'success') {
      return <CheckCircle className="h-4 w-4 text-success" />;
    }
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="glass border-border/50 w-full overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/20 text-accent">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Action Logs</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Recent agent activity</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] sm:h-[400px] pr-2 sm:pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Activity className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No actions yet</p>
                <p className="text-xs text-muted-foreground/70">Run your agent to see activity here</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                <div className="space-y-3">
                  {logs.map((log, index) => (
                    <motion.div
                      key={log.id || `${log.cast_hash}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-3 rounded-lg bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`p-1.5 rounded-md ${log.action_type === 'like' ? 'bg-destructive/20' : 'bg-green-400/20'}`}>
                            {getActionIcon(log.action_type)}
                          </div>
                          {getStatusIcon(log.status)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {log.action_type === 'like' ? 'Liked' : 'Recasted'}
                            </span>
                            <span className="text-sm text-primary">@{log.cast_author}</span>
                          </div>
                          
                          {log.cast_text && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {log.cast_text}
                            </p>
                          )}

                          {log.error_message && (
                            <p className="text-xs text-destructive mb-2">
                              {log.error_message}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                            <Clock className="h-3 w-3" />
                            {log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : 'Just now'}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
}
