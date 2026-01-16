# GitHub OAuth Authentication Issues - Diagnosis & Solutions

**Date**: 2026-01-15
**Issues**: Private repositories not visible + Cannot push changes to repositories

---

## Executive Summary

After comprehensive analysis of the codebase and GitHub OAuth documentation, I've identified the root causes and solutions for both issues:

1. **Private Repositories Not Showing**: Likely caused by insufficient OAuth permissions or organization access restrictions
2. **Push Failures**: Caused by write permission issues, organization approval requirements, or SAML SSO restrictions

**The good news**: The codebase implementation is correct. The issues are related to GitHub OAuth configuration and permissions.

---

## Issue 1: Private Repositories Not Visible

### Current Implementation (CORRECT)

**File**: `app/api/github/repos/route.ts:53`
```typescript
// For authenticated user - includes ALL accessible repos
apiUrl = `https://api.github.com/user/repos?sort=name&direction=asc&per_page=${perPage}&page=${page}&visibility=all&affiliation=owner,collaborator,organization_member`
```

**OAuth Scope**: `repo,read:user,user:email` (from `app/api/auth/github/signin/route.ts`)

This configuration **should** show:
- ✅ Public repositories you own
- ✅ Private repositories you own
- ✅ Private repositories where you're a collaborator
- ✅ Private organization repositories where you're a member

### Root Causes (Why It's Not Working)

#### Cause 1: User Denied `repo` Scope During OAuth
GitHub allows users to modify scopes during authorization. If you clicked "Authorize" but unchecked the `repo` permission, the app only received limited access.

**How to check**:
1. Go to https://github.com/settings/connections/applications
2. Find your OAuth app
3. Check the "Permissions" section - it should show "Full control of private repositories"

**Solution**:
- Disconnect and reconnect your GitHub account with full `repo` permissions
- Or manually grant the missing permission in GitHub settings

#### Cause 2: Organization Access Restrictions
Organizations can restrict OAuth app access. Even with `repo` scope, you need explicit organization approval.

**How to check**:
1. Go to your organization settings
2. Navigate to "Third-party access" → "OAuth application policy"
3. Check if your app is listed and approved

**Solution**:
- **Option A**: Request organization owner approval for the OAuth app
- **Option B**: Organization admin: Go to Settings → Third-party access → Approve the application
- **Note**: This is the #1 most common reason private org repos don't show

#### Cause 3: SAML SSO Not Authorized
If your organization requires SAML SSO, OAuth tokens must be explicitly authorized for SSO.

**How to check**:
1. Go to https://github.com/settings/connections/applications
2. Find your OAuth app
3. Look for "Authorize SSO" buttons next to organizations

**Solution**:
- Click "Authorize" next to each organization that requires SAML SSO
- You'll need to re-authenticate via your organization's SSO provider

---

## Issue 2: Cannot Push Changes to Repository

### Current Implementation (CORRECT)

**File**: `lib/sandbox/config.ts:69-86`
```typescript
export function createAuthenticatedRepoUrl(repoUrl: string, githubToken?: string | null): string {
  if (!githubToken) {
    return repoUrl
  }

  const url = new URL(repoUrl)
  if (url.hostname === 'github.com') {
    // Add GitHub token for authentication
    url.username = githubToken
    url.password = 'x-oauth-basic'
  }
  return url.toString()
}
```

**Git Push**: `lib/sandbox/git.ts:48`
```typescript
const pushResult = await runInProject(sandbox, 'git', ['push', 'origin', branchName])
```

This configuration **should** allow push access to repositories where you have write permissions.

### Root Causes (Why Push Fails)

#### Cause 1: Repository-Level Write Access
The `repo` scope grants **potential** for write access, but the user must have write permissions on the specific repository.

**Scenarios where you CAN'T push**:
- ❌ Collaborator with READ-ONLY access
- ❌ Organization member without push permissions
- ❌ Forked repositories you don't own (must push to your fork)

**Scenarios where you CAN push**:
- ✅ Repositories you own
- ✅ Collaborator with WRITE, MAINTAIN, or ADMIN access
- ✅ Organization member with write permissions

**How to check**:
1. Go to the repository on GitHub
2. Check if you see a "Settings" tab (indicates admin access)
3. Or check your role: Settings → Collaborators (if you can see it)

**Solution**:
- Request write access from the repository owner
- Or fork the repository and work on your fork

#### Cause 2: Organization OAuth App Not Approved (SAME AS ABOVE)
Even if you can see org repos, push requires the OAuth app to be approved by the organization.

**Solution**: Same as Issue 1, Cause 2 above

#### Cause 3: SAML SSO Authorization (SAME AS ABOVE)
OAuth token must be authorized for SSO to push to SSO-protected repositories.

**Solution**: Same as Issue 1, Cause 3 above

#### Cause 4: Protected Branch Rules
The repository might have branch protection rules preventing direct pushes.

**How to check**:
1. Go to repository Settings → Branches
2. Check if `main` or your target branch has protection rules
3. Look for "Require pull request reviews before merging"

**Solution**:
- The app already creates feature branches (not pushing to `main`)
- Feature branches should not have protection rules
- If they do, contact repository admin to adjust rules

#### Cause 5: Fine-Grained Personal Access Tokens (PAT) Limitations
If the user configured fine-grained PATs instead of OAuth tokens, they might have repository-specific restrictions.

**Note**: This app uses OAuth tokens (not PATs), so this is unlikely unless users manually configured PATs.

---

## Verification Steps

### Step 1: Verify OAuth Token Scope
Run this in your browser console while logged into GitHub:
```javascript
// Check your current OAuth token permissions
fetch('https://api.github.com/user', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN_HERE' }
}).then(r => r.headers.get('x-oauth-scopes'))
```

**Expected output**: `repo, read:user, user:email`

### Step 2: Test Repository Access
```bash
# From the sandbox or your local machine
git clone https://YOUR_TOKEN@github.com/owner/private-repo.git
```

**If this works**: Token has read access ✅
**If this fails**: Token lacks read access or organization approval ❌

### Step 3: Test Push Permissions
```bash
cd private-repo
git checkout -b test-branch
echo "test" > test.txt
git add test.txt
git commit -m "Test commit"
git push origin test-branch
```

**If this works**: Token has write access ✅
**If this fails**: Token lacks write access, organization approval, or SSO authorization ❌

---

## Recommended Solutions

### For End Users

**Quick Fix - Reconnect GitHub Account**:
1. In the application, go to your profile
2. Disconnect your GitHub account
3. Reconnect and carefully authorize ALL requested permissions
4. Click "Authorize SSO" for each organization (if applicable)

**Check Organization Access**:
1. Go to https://github.com/settings/connections/applications
2. Find the OAuth application
3. Grant organization access if not already granted
4. Authorize SAML SSO if required

**Verify Repository Permissions**:
1. Ensure you have write access to repositories you want to modify
2. Check with repository/organization owners if you don't have write access

### For Application Administrators

**Option 1: Use GitHub Apps Instead of OAuth Apps** (Long-term solution)
- GitHub Apps have more granular permissions
- Organization admins can approve once for all users
- Better security model (installation access tokens)
- **Migration required**: Significant codebase changes

**Option 2: Document OAuth Requirements** (Immediate solution)
- Add clear instructions during GitHub connection flow
- Show users how to grant organization access
- Provide troubleshooting guide for SAML SSO
- **Implementation**: Update UI with helpful tips

**Option 3: Add Permission Validation** (Medium-term solution)
- After OAuth, verify token scopes match requested scopes
- Check repository write access before creating tasks
- Show clear error messages when permissions are insufficient
- **Implementation**: Add validation in `lib/github/user-token.ts`

---

## Code Improvements (Optional)

### 1. Verify Token Scopes After OAuth

**File**: `app/api/auth/github/callback/route.ts`

Add after receiving the token:
```typescript
// Verify we got the requested scopes
const tokenInfoResponse = await fetch('https://api.github.com/user', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
})

const scopes = tokenInfoResponse.headers.get('x-oauth-scopes')
if (!scopes?.includes('repo')) {
  // Show warning to user that they need to grant repo access
  console.warn('User did not grant repo scope')
}
```

### 2. Check Repository Write Access Before Task Creation

**File**: `app/api/tasks/route.ts`

Add before creating task:
```typescript
// Verify user has write access to the repository
const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
if (repoMatch) {
  const [, owner, repo] = repoMatch
  const checkResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/collaborators/${userInfo.login}/permission`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  )

  if (checkResponse.ok) {
    const { permission } = await checkResponse.json()
    if (!['admin', 'maintain', 'write'].includes(permission)) {
      return NextResponse.json(
        { error: 'You need write access to this repository to create tasks' },
        { status: 403 }
      )
    }
  }
}
```

### 3. Add User-Friendly Error Messages

**File**: `lib/sandbox/git.ts:58-63`

Replace generic error with specific guidance:
```typescript
if (errorMsg.includes('Permission') || errorMsg.includes('access_denied') || errorMsg.includes('403')) {
  await logger.info(
    'Push failed: Insufficient permissions. Please check: (1) You have write access to the repository, (2) Your organization approved this OAuth app, (3) SAML SSO is authorized for your organization.'
  )
}
```

---

## Quick Diagnostic Checklist

Use this checklist to diagnose user issues:

- [ ] **OAuth Scope Verification**
  - User granted `repo` scope during authorization
  - Token scopes include `repo` (verify via GitHub settings)

- [ ] **Organization Access**
  - User requested organization access during OAuth
  - Organization admin approved the OAuth application
  - Visible at: https://github.com/settings/connections/applications

- [ ] **SAML SSO Authorization**
  - User clicked "Authorize SSO" for each organization
  - Visible at: https://github.com/settings/connections/applications
  - Look for green checkmarks next to organizations

- [ ] **Repository-Level Permissions**
  - User has write access to the repository (not just read)
  - User role is: write, maintain, or admin (not just read)
  - Check in repository Settings → Collaborators

- [ ] **Branch Protection Rules**
  - Feature branches are not protected (only main/master typically are)
  - If protected, user meets protection rule requirements

- [ ] **Token Validity**
  - OAuth token is not expired
  - Token is correctly stored and encrypted in database
  - Token retrieval logic works (check `lib/github/user-token.ts`)

---

## GitHub OAuth App Best Practices (2026)

Based on the latest GitHub documentation:

1. **Use Fine-Grained Permissions Where Possible**
   - Fine-grained PATs reached GA status in 2025
   - Consider migrating to fine-grained permissions for better security
   - Allows repository-specific access instead of all-or-nothing

2. **Request Minimum Necessary Scopes**
   - Current `repo` scope is correct (required for private repo access)
   - GitHub does NOT offer read-only scope for private repos (known limitation)
   - Write access is implicitly granted with `repo` scope

3. **Educate Users About OAuth Approval**
   - Show clear instructions during connection flow
   - Explain why `repo` scope is needed (read private repos)
   - Provide troubleshooting tips for organization access

4. **Consider GitHub Apps for Organization-Wide Deployment**
   - Better permission model for organizations
   - Installation-based rather than user-based
   - More secure and auditable

---

## References

### Documentation Created
- `github-auth-analysis.md` - Detailed codebase authentication flow analysis
- `github-oauth-docs-2026.md` - Latest GitHub OAuth documentation and best practices

### Official GitHub Documentation
- [OAuth Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [OAuth App Access Restrictions](https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions)
- [SAML SSO Authorization](https://docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on)
- [Fine-Grained PATs](https://github.blog/changelog/2025-03-18-fine-grained-pats-are-now-generally-available/)

---

## Next Steps

1. **Immediate**: User should disconnect and reconnect GitHub account, ensuring all permissions are granted
2. **Short-term**: Add user-facing documentation about organization access and SAML SSO
3. **Medium-term**: Implement permission validation and better error messages
4. **Long-term**: Consider migrating to GitHub Apps for better organization support

---

**Status**: Analysis complete
**Codebase**: No bugs found - implementation is correct
**Resolution**: Configuration and permission issues on GitHub's side
