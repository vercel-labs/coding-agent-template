---
description: "Setup and manage Supabase authentication in Next.js applications"
argument-hint: "[setup|components|middleware|policies|oauth|troubleshoot]"
allowed-tools: Read(*), Write(*), Bash(npx supabase *), Bash(pnpm add @supabase/supabase-js), Bash(npx shadcn@latest add *)
---

# 🔐 Supabase Authentication: $ARGUMENTS

You are a Supabase authentication expert specializing in modern Next.js applications with the latest auth patterns.

This command uses the Supabase CLI and shadcn to automatically install all necessary auth components and dependencies. **No manual code writing required** - the CLI handles everything.

## CLI-Based Setup Process

### 1. Verify Supabase CLI Installation

```bash
# Check if Supabase CLI is available
npx supabase --version

# If not installed, it will be installed automatically on first use
```

### 2. Initialize Supabase Project (if needed)

```bash
# Only run if supabase/ directory doesn't exist
npx supabase init

# Optionally link to existing Supabase project
npx supabase link --project-ref your-project-ref
```

### 3. Install Complete Auth System via shadcn

**CRITICAL: Use this exact command** - it installs everything automatically:

```bash
npx shadcn@latest add https://supabase.com/ui/r/password-based-auth-nextjs.json
```

**This single command installs:**
- ✅ Complete auth page structure (`app/auth/` with all routes)
- ✅ Supabase client utilities (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`)
- ✅ Auth form components (`components/` with login, signup, logout forms)
- ✅ Root middleware (`middleware.ts`)
- ✅ Protected route example (`app/protected/page.tsx`)
- ✅ All Supabase dependencies (`@supabase/supabase-js`, `@supabase/ssr`)
- ✅ TypeScript types and validation
- ✅ Complete auth flow with server actions

### 4. Post-Installation Verification

**MUST verify all installations completed successfully:**

```bash
# Verify Supabase dependencies were installed
pnpm ls @supabase/supabase-js @supabase/ssr

# Check exact file structure that CLI creates:
ls -la lib/supabase/         # Should see: client.ts, server.ts, middleware.ts
ls -la app/auth/             # Should see: confirm/, error/, forgot-password/, login/, sign-up/, sign-up-success/, update-password/
ls -la components/           # Should see: forgot-password-form.tsx, login-form.tsx, logout-button.tsx, sign-up-form.tsx
ls middleware.ts             # Should exist at project root
ls app/protected/page.tsx    # Protected route example

# Verify TypeScript compilation
pnpm tsc --noEmit
```

## Environment Configuration

**After installation, configure environment variables:**

```bash
# Create .env.local if it doesn't exist
touch .env.local

# Add required Supabase environment variables:
# NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (server-only)
```

**Get these values from:**
- Supabase Dashboard → Settings → API
- Or run: `npx supabase status` (if linked to project)

## Verification Checklist

**After running the shadcn command, verify these exact files exist:**

```bash
# Core Supabase utilities (auto-generated)
ls lib/supabase/client.ts       # ✅ Browser client
ls lib/supabase/server.ts       # ✅ Server client  
ls lib/supabase/middleware.ts   # ✅ Session middleware

# Complete auth page structure (auto-generated)
ls app/auth/confirm/route.ts         # ✅ Email confirmation handler
ls app/auth/error/page.tsx           # ✅ Auth error page
ls app/auth/forgot-password/page.tsx # ✅ Password reset page
ls app/auth/login/page.tsx           # ✅ Login page
ls app/auth/sign-up/page.tsx         # ✅ Signup page
ls app/auth/sign-up-success/page.tsx # ✅ Signup success page
ls app/auth/update-password/page.tsx # ✅ Password update page

# Auth form components (auto-generated)
ls components/forgot-password-form.tsx # ✅ Password reset form
ls components/login-form.tsx           # ✅ Login form
ls components/logout-button.tsx        # ✅ Logout button
ls components/sign-up-form.tsx         # ✅ Signup form
ls components/update-password-form.tsx # ✅ Password update form

# Root middleware and protected example (auto-generated)
ls middleware.ts              # ✅ Root middleware file
ls app/protected/page.tsx     # ✅ Protected route example
```

**Test the installation:**

```bash
# Verify all imports resolve correctly
pnpm tsc --noEmit

# Check that Supabase packages are installed
pnpm ls @supabase/supabase-js @supabase/ssr

# Start dev server to test all auth pages
pnpm dev

# Test all generated auth routes:
# http://localhost:3000/auth/login           - Login page
# http://localhost:3000/auth/sign-up         - Signup page
# http://localhost:3000/auth/forgot-password - Password reset
# http://localhost:3000/auth/error           - Error handling
# http://localhost:3000/protected            - Protected route example
```

## Database Setup (Optional)

**If you need custom user profiles, use the RLS policies slash command:**

```bash
# Use the dedicated RLS command for database setup
# This handles RLS policies, indexes, and security properly
```

The auth components work with Supabase's built-in `auth.users` table automatically. Custom profiles are optional.

## Advanced Configuration

### OAuth Providers Setup

**Enable OAuth in Supabase Dashboard:**
1. Go to Authentication → Providers
2. Configure desired providers (GitHub, Google, etc.)
3. The shadcn components include OAuth support automatically

### Email Confirmation Setup

**Enable email confirmation in Supabase Dashboard:**
1. Go to Authentication → Settings
2. Enable "Enable email confirmations"
3. Configure redirect URLs for your domain
4. The components handle email confirmation flows automatically

### Supabase Local Development (Optional)

**For full local development with database:**

```bash
# Start local Supabase stack
npx supabase start

# View local dashboard
npx supabase status
# Dashboard URL will be shown (usually http://localhost:54323)

# Apply any database migrations
npx supabase db push

# Stop when done
npx supabase stop
```

## Verification & Testing

### Required Checks After Installation

**1. Verify all components work:**

```bash
# Test auth pages load without errors
curl -I http://localhost:3000/auth/login
curl -I http://localhost:3000/auth/signup

# Check TypeScript compilation
pnpm tsc --noEmit

# Verify environment variables are loaded
pnpm dev
# Should show no Supabase connection errors in console
```

**2. Test complete authentication flow:**

```bash
# Start development server
pnpm dev

# Manually test all auth routes:
# 1. Visit /auth/sign-up - signup form should render
# 2. Visit /auth/login - login form should render  
# 3. Visit /auth/forgot-password - password reset form
# 4. Visit /auth/error - error page (if redirected)
# 5. Visit /protected - should redirect to login if not authenticated
# 6. Check browser console for any errors
# 7. Test form submissions (should connect to Supabase)
```

## Troubleshooting Installation Issues

**shadcn command fails:**
```bash
# Check if components.json exists
ls components.json

# If missing, initialize shadcn first:
npx shadcn@latest init

# Then retry the auth installation:
npx shadcn@latest add https://supabase.com/ui/r/password-based-auth-nextjs.json
```

**Missing files after installation:**
```bash
# Re-run the command - it's safe to run multiple times
npx shadcn@latest add https://supabase.com/ui/r/password-based-auth-nextjs.json

# Force reinstall if needed:
npx shadcn@latest add https://supabase.com/ui/r/password-based-auth-nextjs.json --overwrite
```

**Environment variable issues:**
```bash
# Verify variables are set correctly
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY

# Check .env.local file exists and has correct values
cat .env.local
```

**TypeScript compilation errors:**
```bash
# Install missing dependencies
pnpm install

# Check for version conflicts
pnpm ls @supabase/supabase-js @supabase/ssr

# Clean and rebuild
rm -rf .next && pnpm dev
```

## Success Criteria

**✅ Installation is complete when:**

1. `pnpm tsc --noEmit` passes without errors
2. `pnpm dev` starts without Supabase connection errors  
3. All auth pages render correctly:
   - `/auth/login` - Login form
   - `/auth/sign-up` - Signup form  
   - `/auth/forgot-password` - Password reset form
   - `/auth/error` - Error handling page
   - `/protected` - Protected route example
4. All required files exist (verified with exact `ls` commands above)
5. Supabase packages are installed (`pnpm ls` shows them)
6. Environment variables are configured
7. All 5 auth form components exist in `/components/`
8. Root `middleware.ts` exists and handles auth

**🔗 Next Steps:**
- Configure authentication providers in Supabase Dashboard
- Set up custom user profiles (use RLS policies slash command)  
- Add protected routes using the middleware
- Test full authentication flow with real users

## References

- **Primary**: [Supabase Auth with Next.js](https://supabase.com/ui/docs/nextjs/password-based-auth)
- **shadcn Auth Components**: [Password-based Auth Block](https://supabase.com/ui/r/password-based-auth-nextjs.json)
- **Supabase CLI**: [CLI Documentation](https://supabase.com/docs/reference/cli)
- **Auth Configuration**: [Supabase Auth Guide](https://supabase.com/docs/guides/auth)