import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass sticky top-0 z-50 border-b border-border/50"
    >
      <div className="w-full max-w-full mx-auto px-2 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2 overflow-x-hidden">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">FarAgent</h1>
            <p className="text-xs text-muted-foreground">Base × Farcaster</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground text-xs sm:text-sm"
            >
              <LogOut className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        )}
      </div>
    </motion.header>
  );
}
