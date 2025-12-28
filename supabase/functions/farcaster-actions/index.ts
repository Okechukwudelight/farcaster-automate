import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NEYNAR_API_KEY = Deno.env.get('NEYNAR_API_KEY');
const NEYNAR_BASE_URL = 'https://api.neynar.com/v2';

interface FarcasterActionRequest {
  action: 'like' | 'recast' | 'fetch_feed' | 'search_usernames' | 'fetch_user_profile' | 'fetch_user_casts';
  signerUuid?: string;
  castHash?: string;
  keywords?: string[];
  accounts?: string[];
  limit?: number;
  query?: string;
  username?: string;
}

async function likeCast(signerUuid: string, castHash: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Liking cast ${castHash} with signer ${signerUuid}`);
    
    const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/reaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': NEYNAR_API_KEY!,
      },
      body: JSON.stringify({
        signer_uuid: signerUuid,
        reaction_type: 'like',
        target: castHash,
      }),
    });

    const data = await response.json();
    console.log('Like response:', JSON.stringify(data));

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to like cast' };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Error liking cast:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function recast(signerUuid: string, castHash: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Recasting ${castHash} with signer ${signerUuid}`);
    
    const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/reaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': NEYNAR_API_KEY!,
      },
      body: JSON.stringify({
        signer_uuid: signerUuid,
        reaction_type: 'recast',
        target: castHash,
      }),
    });

    const data = await response.json();
    console.log('Recast response:', JSON.stringify(data));

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to recast' };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Error recasting:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function searchUsernames(query: string): Promise<{ usernames: string[] }> {
  try {
    console.log('Searching usernames for query:', query);
    
    const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/search?q=${encodeURIComponent(query)}&limit=10`, {
      headers: {
        'api_key': NEYNAR_API_KEY!,
      },
    });

    const data = await response.json();
    console.log('Username search response:', JSON.stringify(data));

    if (!response.ok) {
      throw new Error(data.message || 'Failed to search usernames');
    }

    const usernames = (data.result?.users || []).map((user: any) => user.username);
    return { usernames };
  } catch (error) {
    console.error('Error searching usernames:', error);
    throw error;
  }
}

async function fetchUserProfile(username: string): Promise<any> {
  try {
    console.log('Fetching user profile for:', username);
    
    // Use the user/by_username endpoint (free tier)
    const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/by_username?username=${encodeURIComponent(username)}`, {
      headers: {
        'api_key': NEYNAR_API_KEY!,
      },
    });

    const data = await response.json();
    console.log('User profile response status:', response.status);

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch user profile');
    }

    const user = data.user;
    return {
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      pfpUrl: user.pfp_url,
      bio: user.profile?.bio?.text || '',
      followerCount: user.follower_count,
      followingCount: user.following_count,
      verifiedAddresses: user.verified_addresses?.eth_addresses || [],
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

async function fetchUserCasts(username: string, limit: number = 20): Promise<any> {
  try {
    console.log('Fetching casts for user:', username);
    
    // First get the user's FID
    const profileResponse = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/by_username?username=${encodeURIComponent(username)}`, {
      headers: {
        'api_key': NEYNAR_API_KEY!,
      },
    });

    const profileData = await profileResponse.json();
    if (!profileResponse.ok) {
      throw new Error(profileData.message || 'Failed to fetch user');
    }

    const fid = profileData.user.fid;
    
    // Fetch user's casts using the feed endpoint
    const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/feed/user/${fid}/casts?limit=${limit}`, {
      headers: {
        'api_key': NEYNAR_API_KEY!,
      },
    });

    const data = await response.json();
    console.log('User casts response count:', data.casts?.length);

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch user casts');
    }

    return {
      casts: (data.casts || []).map((cast: any) => ({
        hash: cast.hash,
        text: cast.text,
        timestamp: cast.timestamp,
        likes: cast.reactions?.likes_count || 0,
        recasts: cast.reactions?.recasts_count || 0,
        replies: cast.replies?.count || 0,
        embeds: cast.embeds || [],
      })),
    };
  } catch (error) {
    console.error('Error fetching user casts:', error);
    throw error;
  }
}

async function fetchFeed(keywords: string[], accounts: string[], limit: number = 25): Promise<any> {
  try {
    console.log('Fetching feed with keywords:', keywords, 'accounts:', accounts);
    
    // Fetch trending feed
    const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/feed/trending?limit=${limit}&time_window=24h`, {
      headers: {
        'api_key': NEYNAR_API_KEY!,
      },
    });

    const data = await response.json();
    console.log('Feed response casts count:', data.casts?.length);

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch feed');
    }

    // Filter casts based on keywords and accounts
    let filteredCasts = data.casts || [];

    if (keywords.length > 0) {
      const keywordLower = keywords.map(k => k.toLowerCase().trim());
      filteredCasts = filteredCasts.filter((cast: any) => {
        const text = (cast.text || '').toLowerCase();
        return keywordLower.some(keyword => text.includes(keyword));
      });
    }

    if (accounts.length > 0) {
      const accountsLower = accounts.map(a => a.toLowerCase().trim().replace('@', ''));
      filteredCasts = filteredCasts.filter((cast: any) => {
        const username = (cast.author?.username || '').toLowerCase();
        return accountsLower.includes(username);
      });
    }

    return {
      casts: filteredCasts.map((cast: any) => ({
        hash: cast.hash,
        text: cast.text,
        author: {
          fid: cast.author?.fid,
          username: cast.author?.username,
          display_name: cast.author?.display_name,
          pfp_url: cast.author?.pfp_url,
        },
        timestamp: cast.timestamp,
        reactions: cast.reactions,
      })),
    };
  } catch (error) {
    console.error('Error fetching feed:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: FarcasterActionRequest = await req.json();
    console.log('Received request:', JSON.stringify(body));

    if (!NEYNAR_API_KEY) {
      throw new Error('NEYNAR_API_KEY not configured');
    }

    let result;

    switch (body.action) {
      case 'like':
        if (!body.signerUuid || !body.castHash) {
          throw new Error('signerUuid and castHash are required for like action');
        }
        result = await likeCast(body.signerUuid, body.castHash);
        break;

      case 'recast':
        if (!body.signerUuid || !body.castHash) {
          throw new Error('signerUuid and castHash are required for recast action');
        }
        result = await recast(body.signerUuid, body.castHash);
        break;

      case 'fetch_feed':
        result = await fetchFeed(
          body.keywords || [],
          body.accounts || [],
          body.limit || 25
        );
        break;

      case 'search_usernames':
        if (!body.query) {
          throw new Error('query is required for search_usernames action');
        }
        result = await searchUsernames(body.query);
        break;

      case 'fetch_user_profile':
        if (!body.username) {
          throw new Error('username is required for fetch_user_profile action');
        }
        result = await fetchUserProfile(body.username);
        break;

      case 'fetch_user_casts':
        if (!body.username) {
          throw new Error('username is required for fetch_user_casts action');
        }
        result = await fetchUserCasts(body.username, body.limit || 20);
        break;

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in farcaster-actions:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
