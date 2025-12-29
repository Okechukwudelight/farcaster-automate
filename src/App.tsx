import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { WalletProvider } from "@/hooks/useWallet";
import { AuthKitProvider } from "@farcaster/auth-kit";
import "@farcaster/auth-kit/styles.css";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Remittance from "./pages/Remittance";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Farcaster AuthKit config
const farcasterConfig = {
  relay: "https://relay.farcaster.xyz",
  rpcUrl: "https://optimism.publicnode.com",
  domain: window.location.hostname,
  siweUri: `${window.location.origin}/auth`,
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthKitProvider config={farcasterConfig}>
      <AuthProvider>
        <WalletProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/remittance" element={<Remittance />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </WalletProvider>
      </AuthProvider>
    </AuthKitProvider>
  </QueryClientProvider>
);

export default App;
