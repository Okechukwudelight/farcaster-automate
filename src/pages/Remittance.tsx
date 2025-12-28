import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { RemittanceSender } from '@/components/RemittanceSender';
import { TransactionsDashboard } from '@/components/TransactionsDashboard';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function Remittance() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
            <span className="text-gradient">Remittance Agent</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Send stablecoins securely on Base network
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <RemittanceSender />
          <TransactionsDashboard />
        </div>
      </main>
    </div>
  );
}
