import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NEYNAR_API_KEY = Deno.env.get('NEYNAR_API_KEY');
const NEYNAR_BASE_URL = 'https://api.neynar.com/v2';

interface SignerRequest {
  action: 'create' | 'status' | 'lookup_user';
  signerUuid?: string;
  fid?: number;
  custodyAddress?: string;
}

async function createSigner(): Promise<any> {
  console.log('Creating new Neynar signer...');
  
  const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/signer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': NEYNAR_API_KEY!,
    },
  });

  const data = await response.json();
  console.log('Create signer response:', JSON.stringify(data));

  if (!response.ok) {
    throw new Error(data.message || 'Failed to create signer');
  }

  return data;
}

async function getSignerStatus(signerUuid: string): Promise<any> {
  console.log('Getting signer status for:', signerUuid);
  
  const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/signer?signer_uuid=${signerUuid}`, {
    headers: {
      'api_key': NEYNAR_API_KEY!,
    },
  });

  const data = await response.json();
  console.log('Signer status response:', JSON.stringify(data));

  if (!response.ok) {
    throw new Error(data.message || 'Failed to get signer status');
  }

  return data;
}

async function lookupUserByAddress(custodyAddress: string): Promise<any> {
  console.log('Looking up user by custody address:', custodyAddress);
  
  const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/by_username?username=${custodyAddress}`, {
    headers: {
      'api_key': NEYNAR_API_KEY!,
    },
  });

  // If username lookup fails, try by custody address
  if (!response.ok) {
    console.log('Username lookup failed, trying custody address...');
    const addressResponse = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/custody-address?custody_address=${custodyAddress}`, {
      headers: {
        'api_key': NEYNAR_API_KEY!,
      },
    });

    if (!addressResponse.ok) {
      return null;
    }

    return await addressResponse.json();
  }

  return await response.json();
}

async function lookupUserByFid(fid: number): Promise<any> {
  console.log('Looking up user by FID:', fid);
  
  const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/bulk?fids=${fid}`, {
    headers: {
      'api_key': NEYNAR_API_KEY!,
    },
  });

  const data = await response.json();
  console.log('User lookup response:', JSON.stringify(data));

  if (!response.ok) {
    throw new Error(data.message || 'Failed to lookup user');
  }

  return data.users?.[0] || null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SignerRequest = await req.json();
    console.log('Received signer request:', JSON.stringify(body));

    if (!NEYNAR_API_KEY) {
      throw new Error('NEYNAR_API_KEY not configured');
    }

    let result;

    switch (body.action) {
      case 'create':
        result = await createSigner();
        break;

      case 'status':
        if (!body.signerUuid) {
          throw new Error('signerUuid is required for status action');
        }
        result = await getSignerStatus(body.signerUuid);
        break;

      case 'lookup_user':
        if (body.fid) {
          result = await lookupUserByFid(body.fid);
        } else if (body.custodyAddress) {
          result = await lookupUserByAddress(body.custodyAddress);
        } else {
          throw new Error('fid or custodyAddress is required for lookup_user action');
        }
        break;

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in farcaster-signer:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
