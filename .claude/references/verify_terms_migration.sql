-- =====================================================
-- Terms & Conditions Tracking Verification Script
-- =====================================================
-- Run this script in Supabase SQL Editor to verify migration 0014 is applied

-- =====================================================
-- 1. CHECK TRIGGER INSTALLATION
-- =====================================================
-- Should return 1 row with on_auth_user_created trigger
SELECT
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgfoid::regproc as function_name,
  tgenabled as enabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- =====================================================
-- 2. CHECK FUNCTION IMPLEMENTATION
-- =====================================================
-- Should return function source containing "terms_accepted_at" and exception handling
SELECT
  proname as function_name,
  proargtypes,
  LENGTH(prosrc) as source_length,
  CASE WHEN prosrc LIKE '%terms_accepted_at%' THEN 'YES - Updated for consent extraction'
       ELSE 'NO - Still using old version'
  END as has_consent_extraction,
  CASE WHEN prosrc LIKE '%EXCEPTION%' THEN 'YES - Has error handling'
       ELSE 'NO - Missing error handling'
  END as has_exception_handling
FROM pg_proc
WHERE proname = 'create_user_on_signup';

-- =====================================================
-- 3. VERIFY USER TABLE COLUMNS
-- =====================================================
-- Should show termsAcceptedAt and privacyAcceptedAt columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'User' AND table_schema = 'public'
ORDER BY ordinal_position;

-- =====================================================
-- 4. CHECK RECENT USER RECORDS (Last 10)
-- =====================================================
-- Shows if new signups have consent timestamps populated
SELECT
  id,
  email,
  "termsAcceptedAt",
  "privacyAcceptedAt",
  "createdAt",
  CASE
    WHEN "termsAcceptedAt" IS NOT NULL AND "privacyAcceptedAt" IS NOT NULL THEN 'Fully consented'
    WHEN "termsAcceptedAt" IS NULL AND "privacyAcceptedAt" IS NULL THEN 'Grandfathered or OAuth'
    ELSE 'Partial consent'
  END as consent_status
FROM public."User"
ORDER BY "createdAt" DESC
LIMIT 10;

-- =====================================================
-- 5. DATA CONSISTENCY SUMMARY
-- =====================================================
-- Overall consent tracking coverage
SELECT
  COUNT(*) as total_users,
  COUNT("termsAcceptedAt") as users_with_terms_acceptance,
  COUNT("privacyAcceptedAt") as users_with_privacy_acceptance,
  COUNT(*) - COUNT("termsAcceptedAt") as grandfathered_users,
  ROUND(100.0 * COUNT("termsAcceptedAt") / COUNT(*), 2) as consent_coverage_percent
FROM public."User";

-- =====================================================
-- 6. CHECK FOR PARSING FAILURES
-- =====================================================
-- Identifies users with asymmetric consent (should be rare after fix)
SELECT
  id,
  email,
  "termsAcceptedAt",
  "privacyAcceptedAt",
  "createdAt",
  CASE
    WHEN "termsAcceptedAt" IS NULL AND "privacyAcceptedAt" IS NOT NULL THEN 'Terms parsing failed'
    WHEN "termsAcceptedAt" IS NOT NULL AND "privacyAcceptedAt" IS NULL THEN 'Privacy parsing failed'
    ELSE 'Both or neither populated'
  END as anomaly_type
FROM public."User"
WHERE ("termsAcceptedAt" IS NULL AND "privacyAcceptedAt" IS NOT NULL)
   OR ("termsAcceptedAt" IS NOT NULL AND "privacyAcceptedAt" IS NULL)
LIMIT 20;

-- =====================================================
-- 7. VERIFY OAUTH vs NATIVE SIGNUPS
-- =====================================================
-- Shows consent tracking by signup method
SELECT
  CASE
    WHEN email LIKE '%@example.com' THEN 'Guest/OAuth'
    ELSE 'Native Email'
  END as signup_method,
  COUNT(*) as user_count,
  COUNT("termsAcceptedAt") as with_consent,
  COUNT(*) - COUNT("termsAcceptedAt") as without_consent
FROM public."User"
GROUP BY signup_method
ORDER BY user_count DESC;

-- =====================================================
-- 8. CHECK AUTH METADATA FOR RECENT SIGNUP
-- =====================================================
-- Verify that new auth.users have consent metadata in raw_user_meta_data
-- Run this after creating a test account
SELECT
  id,
  email,
  created_at,
  raw_user_meta_data,
  CASE
    WHEN raw_user_meta_data::jsonb->>'terms_accepted_at' IS NOT NULL THEN 'Present'
    ELSE 'Missing'
  END as terms_metadata_status
FROM auth.users
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC
LIMIT 5;

-- =====================================================
-- 9. CROSS-CHECK: AUTH vs USER TABLE
-- =====================================================
-- Verify that recent auth.users have corresponding User table records with consent
SELECT
  au.id,
  au.email,
  au.created_at,
  CASE WHEN au.raw_user_meta_data::jsonb->>'terms_accepted_at' IS NOT NULL THEN true ELSE false END as auth_has_terms,
  u."termsAcceptedAt" IS NOT NULL as user_has_terms,
  CASE
    WHEN au.raw_user_meta_data::jsonb->>'terms_accepted_at' IS NOT NULL AND u."termsAcceptedAt" IS NOT NULL THEN 'OK'
    WHEN au.raw_user_meta_data::jsonb->>'terms_accepted_at' IS NULL AND u."termsAcceptedAt" IS NULL THEN 'Both NULL (expected for OAuth)'
    ELSE 'MISMATCH - Check trigger'
  END as consistency_status
FROM auth.users au
LEFT JOIN public."User" u ON au.id = u.id
WHERE au.created_at > NOW() - INTERVAL '7 days'
ORDER BY au.created_at DESC
LIMIT 20;

-- =====================================================
-- SUMMARY INTERPRETATION
-- =====================================================
-- EXPECTED RESULTS:
-- 1. Trigger query: Should return 1 row for on_auth_user_created trigger
-- 2. Function query: Should show YES for both has_consent_extraction and has_exception_handling
-- 3. Columns query: Should list termsAcceptedAt and privacyAcceptedAt as TIMESTAMP columns
-- 4. Recent users: New signups should have populated timestamps (NOT NULL)
-- 5. Summary: Should show high consent_coverage_percent for recent users
-- 6. Parsing failures: Should be 0 rows (or very few from migration edge cases)
-- 7. Signup methods: Native Email should have higher consent_coverage_percent
-- 8. Auth metadata: Raw metadata should contain terms_accepted_at in recent signups
-- 9. Cross-check: All recent signups should have OK status (not MISMATCH)
