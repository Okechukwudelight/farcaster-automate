-- One-time script to reset all Farcaster user passwords to the new format
-- Run this in Supabase Dashboard → SQL Editor
-- This will update all existing Farcaster users to use the new password format: fc_{fid}_{username}

-- Note: This requires the service role key to be used (via Supabase Dashboard or admin API)
-- Since we can't run this directly from the client, you'll need to:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Run this script (it will show you the updates needed)
-- 3. Then manually update each user's password in Authentication → Users

-- First, let's see which users need password resets
SELECT 
  u.id,
  u.email,
  uc.farcaster_fid,
  uc.farcaster_username,
  'fc_' || uc.farcaster_fid || '_' || uc.farcaster_username as new_password
FROM auth.users u
JOIN public.user_connections uc ON u.id = uc.user_id
WHERE u.email LIKE 'farcaster_%@faragent.local'
  AND uc.farcaster_fid IS NOT NULL
  AND uc.farcaster_username IS NOT NULL
ORDER BY uc.farcaster_fid;

-- To actually reset passwords, you'll need to use the Supabase Admin API
-- Or manually update each user in Authentication → Users with the password shown above

