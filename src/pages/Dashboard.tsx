import { useState } from 'react';
import { Header } from '@/components/Header';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { AgentBuilder } from '@/components/AgentBuilder';
import { ActionLogs } from '@/components/ActionLogs';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const [newActions, setNewActions] = useState<any[]>([]);

  const handleAgentRun = (results: any[]) => {
    // Add temporary IDs for new actions
    const actionsWithIds = results.map((action, idx) => ({
      ...action,
      id: `new-${Date.now()}-${idx}`,
      created_at: new Date().toISOString(),
    }));
    setNewActions(actionsWithIds);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden w-full">
      {/* Background effects */}
      <div className="fixed inset-0 bg-gradient-glow opacity-30 pointer-events-none" />
      <div className="fixed top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <Header />

      <main className="w-full max-w-full mx-auto px-2 sm:px-4 py-4 sm:py-8 relative z-10 overflow-x-hidden">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            <span className="text-gradient">Agent Dashboard</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create and manage your Farcaster automation agent
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4 sm:space-y-6">
            <ConnectionPanel />
            <AgentBuilder onAgentRun={handleAgentRun} />
          </div>
          <div>
            <ActionLogs newActions={newActions} />
          </div>
        </div>
      </main>
    </div>
  );
}
