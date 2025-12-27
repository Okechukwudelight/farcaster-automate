import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  signerUuid: string | null;
}

interface FarcasterState {
  user: FarcasterUser | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
}

export function useFarcaster() {
  const { user: authUser } = useAuth();
  const [state, setState] = useState<FarcasterState>({
    user: null,
    isConnecting: false,
    isConnected: false,
    error: null,
  });

  // For demo purposes, we'll simulate a Farcaster connection
  // In production, you'd use @farcaster/auth-kit or Neynar's Sign In with Farcaster
  const connect = useCallback(async () => {
    if (!authUser) {
      setState(prev => ({ ...prev, error: 'Please sign in first' }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Create a signer via Neynar
      const { data: signerData, error: signerError } = await supabase.functions.invoke('farcaster-signer', {
        body: { action: 'create' },
      });

      if (signerError) throw signerError;

      console.log('Signer created:', signerData);

      // For demo, we'll use mock user data
      // In production, user would authenticate via Farcaster and we'd get real data
      const mockUser: FarcasterUser = {
        fid: 12345,
        username: 'demo_user',
        displayName: 'Demo User',
        pfpUrl: 'https://i.pravatar.cc/150?img=3',
        signerUuid: signerData.signer_uuid,
      };

      // Save to database
      const { error: dbError } = await supabase
        .from('user_connections')
        .upsert({
          user_id: authUser.id,
          farcaster_fid: mockUser.fid,
          farcaster_username: mockUser.username,
          farcaster_display_name: mockUser.displayName,
          farcaster_pfp_url: mockUser.pfpUrl,
          farcaster_signer_uuid: mockUser.signerUuid,
        }, { onConflict: 'user_id' });

      if (dbError) throw dbError;

      setState({
        user: mockUser,
        isConnecting: false,
        isConnected: true,
        error: null,
      });
    } catch (error: any) {
      console.error('Farcaster connection error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect Farcaster',
      }));
    }
  }, [authUser]);

  const disconnect = useCallback(async () => {
    if (authUser) {
      await supabase
        .from('user_connections')
        .update({
          farcaster_fid: null,
          farcaster_username: null,
          farcaster_display_name: null,
          farcaster_pfp_url: null,
          farcaster_signer_uuid: null,
        })
        .eq('user_id', authUser.id);
    }

    setState({
      user: null,
      isConnecting: false,
      isConnected: false,
      error: null,
    });
  }, [authUser]);

  const loadConnection = useCallback(async () => {
    if (!authUser) return;

    try {
      const { data, error } = await supabase
        .from('user_connections')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.farcaster_fid) {
        setState({
          user: {
            fid: data.farcaster_fid,
            username: data.farcaster_username || '',
            displayName: data.farcaster_display_name || '',
            pfpUrl: data.farcaster_pfp_url || '',
            signerUuid: data.farcaster_signer_uuid,
          },
          isConnecting: false,
          isConnected: true,
          error: null,
        });
      }
    } catch (error) {
      console.error('Failed to load Farcaster connection:', error);
    }
  }, [authUser]);

  return {
    ...state,
    connect,
    disconnect,
    loadConnection,
  };
}
