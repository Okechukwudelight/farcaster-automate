import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

interface AnalysisRequest {
  profile: {
    username: string;
    displayName: string;
    bio: string;
    followerCount: number;
    followingCount: number;
  };
  casts: Array<{
    text: string;
    timestamp: string;
    likes: number;
    recasts: number;
    replies: number;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profile, casts }: AnalysisRequest = await req.json();
    console.log('Analyzing profile:', profile.username, 'with', casts.length, 'casts');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Prepare cast data for analysis
    const castSummary = casts.slice(0, 15).map((cast, i) => ({
      index: i + 1,
      text: cast.text.slice(0, 300),
      timestamp: cast.timestamp,
      engagement: { likes: cast.likes, recasts: cast.recasts, replies: cast.replies },
    }));

    const prompt = `You are an AI agent analyst for Farcaster (a decentralized social protocol). Analyze this user's profile and recent casts to generate actionable agent recommendations.

USER PROFILE:
- Username: @${profile.username}
- Display Name: ${profile.displayName}
- Bio: ${profile.bio || 'No bio'}
- Followers: ${profile.followerCount}
- Following: ${profile.followingCount}

RECENT CASTS (most recent first):
${JSON.stringify(castSummary, null, 2)}

Based on this data, provide a comprehensive agent simulation. Return your analysis as a JSON object with this exact structure:

{
  "contentThemes": ["theme1", "theme2", "theme3"],
  "postingPatterns": {
    "bestTimes": ["9:00 AM UTC", "2:00 PM UTC", "7:00 PM UTC"],
    "bestDays": ["Monday", "Wednesday", "Friday"],
    "averagePostFrequency": "X posts per day/week"
  },
  "suggestedPosts": [
    {
      "content": "Suggested post text that matches their style...",
      "reasoning": "Why this would resonate with their audience",
      "expectedEngagement": "high/medium/low"
    },
    {
      "content": "Another suggested post...",
      "reasoning": "Reasoning...",
      "expectedEngagement": "high/medium/low"
    },
    {
      "content": "Third suggested post...",
      "reasoning": "Reasoning...",
      "expectedEngagement": "high/medium/low"
    }
  ],
  "suggestedLikes": [
    {
      "topic": "Topic/keyword to look for",
      "reason": "Why engaging with this content helps growth"
    },
    {
      "topic": "Another topic",
      "reason": "Reason..."
    }
  ],
  "suggestedRecasts": [
    {
      "type": "Type of content to recast (e.g., 'industry news', 'community highlights')",
      "reason": "Strategic reason for recasting this content"
    }
  ],
  "audienceInsights": {
    "targetAudience": "Description of who their content appeals to",
    "growthOpportunities": ["opportunity1", "opportunity2"],
    "contentGaps": ["gap1", "gap2"]
  },
  "agentStrategy": {
    "focus": "Primary recommendation for an AI agent",
    "actions": ["action1", "action2", "action3"],
    "cautions": ["things to avoid"]
  }
}

Respond ONLY with the JSON object, no additional text.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert social media strategist specializing in Web3 and decentralized social platforms. You analyze user behavior and generate actionable recommendations. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing...');

    // Parse the JSON response
    let analysis;
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = content;
      if (content.includes('```json')) {
        jsonStr = content.split('```json')[1].split('```')[0].trim();
      } else if (content.includes('```')) {
        jsonStr = content.split('```')[1].split('```')[0].trim();
      }
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse AI analysis');
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in agent-analysis:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
