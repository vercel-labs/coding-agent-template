# GitHub OAuth Documentation 2026

Research findings on GitHub OAuth scopes, permissions, and troubleshooting for repository access and push operations.

---

## 1. OAuth Scopes for Private Repository Access

### Primary Scope: `repo`

The **`repo`** scope is required for full access to private repositories:

- **Grant**: Full access to public and private repositories
- **Includes**:
  - Read and write access to code
  - Commit status management
  - Repository invitations
  - Collaborator management
  - Deployment status access
  - Repository webhook management

### Important Limitation: No Read-Only Private Repo Scope

**Critical Finding**: GitHub does not currently provide an OAuth scope that allows **read-only** access to private repositories. This is a known limitation since 2015.

- Public repositories can use the `public_repo` scope (read + write)
- Private repositories require the full `repo` scope (read + write by necessity)
- Giving OAuth app access to private repos implies write permissions

This creates a security trade-off: OAuth apps cannot have granular control to prevent accidental writes to private repositories.

### Alternative Scopes (Partial Access)

If you need limited scope access:

| Scope | Use Case | Limitations |
|-------|----------|-------------|
| `public_repo` | Public repos only | Write access to public repos only |
| `repo:status` | Commit statuses | Read/write to commit statuses without code access |
| `repo_deployment` | Deployment status | Access to deployment statuses only |

### Scope Normalization

When requesting multiple scopes, GitHub normalizes them and discards redundant permissions. For example:
- `user:email` is already included in the `user` scope
- `repo:status` is included in `repo`

---

## 2. OAuth Scopes for Push Access

### Required Scope for Git Push Operations

To perform `git push` operations (commit, push to repository):

**Scope Required**: `repo`

- **Authentication Method**: OAuth token used as password for HTTPS Git operations
- **Git Configuration**: Token acts as bearer token for HTTP-based Git access
- **Permissions**: Write access to repository contents is implicit with `repo` scope

### Token-Based Authentication for Push

GitHub requires token-based authentication for all Git operations over HTTPS:

- **Personal Access Tokens (classic)** - Works with OAuth-equivalent scopes
- **OAuth-based flows** - OAuth tokens can be used as git credentials
- **GitHub App installation tokens** - Preferred for applications (short-lived)

### Using OAuth Token for Git Push

```bash
# Use OAuth token as password in HTTPS URL
git config credential.helper store
echo "https://[token]:x-oauth-basic@github.com" > ~/.git-credentials

# Or use token directly
git push https://[oauth-token]@github.com/owner/repo.git
```

---

## 3. Fine-Grained Personal Access Tokens (PATs) vs. Classic

### Overview: GA Status (2026)

Fine-grained PATs reached **General Availability (GA)** and are now the recommended alternative to classic PATs.

**Usage Statistics**: Millions of users have used fine-grained PATs over the last two years, making tens of billions of API calls.

### Side-by-Side Comparison

| Feature | Classic PAT | Fine-Grained PAT |
|---------|-----------|-----------------|
| **Scope Model** | Broad scopes (e.g., `repo`, `admin:org`) | Granular, repository-specific permissions |
| **Repository Access** | All user's repositories or all org repos | Specific selected repositories |
| **Permissions** | Coarse-grained scope-based | Fine-grained permission-based |
| **Expiration** | Optional (can live forever) | **Mandatory** (required expiration date) |
| **Admin Control** | No organizational control | Full visibility & approval policies for orgs |
| **Security** | Broader attack surface if leaked | Reduced blast radius if compromised |
| **Multi-org Access** | Single token for multiple orgs | Limited to single organization |

### Fine-Grained PAT Advantages

1. **Principle of Least Privilege**: Grant only exact permissions needed
2. **Organization Control**: Admins can see, approve, and revoke tokens
3. **Mandatory Expiration**: Forces periodic rotation for security
4. **Reduced Blast Radius**: Compromised token has limited scope
5. **Repository-Specific**: Can limit to exact repos needing access

### Fine-Grained PAT Limitations

Fine-grained PATs are **not suitable** for:

- Accessing multiple organizations with a single token
- Contributing to repositories as outside collaborator or unaffiliated OSS contributor
- Accessing internal repositories in enterprise outside of targeted organization

### Recommendation (2026)

**Use fine-grained PATs whenever possible** instead of classic PATs. This approach:
- Decreases attack surface if credentials are compromised
- Provides organizational oversight and control
- Aligns with principle of least privilege
- Required expiration ensures regular security rotation

---

## 4. Common Permission Issues & Troubleshooting

### Issue 1: OAuth App Not Approved by Organization

**Symptom**: "Permission denied" when accessing private organization repositories

**Causes**:
- OAuth app access restrictions are enabled on the organization
- App has not been approved by organization owner
- API access to private org resources requires explicit approval

**Solution**:
1. User requests owner approval for the OAuth app
2. Organization owner receives pending request notification
3. Owner approves app in organization settings
4. App gains access to private resources

**Reference**: [About OAuth app access restrictions](https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions)

### Issue 2: SAML SSO Requirements

**Symptom**: "You must re-authorize the OAuth Application" error on organization with SAML SSO

**Causes**:
- Organization has SAML single sign-on (SSO) enabled
- User's SAML session has expired for that organization
- OAuth app needs fresh authorization after SSO session expires

**Solution**:
```bash
# Reauthorize using GitHub CLI
gh auth login

# Walk through the authentication flow
# This establishes active SAML session and reauthorizes app
```

**Why This Works**:
- Establishes active SAML session with organization
- Refreshes OAuth authorization for that session
- Allows subsequent git push operations to succeed

### Issue 3: Permission Denied for Unapproved Scopes

**Symptom**: OAuth token works for some operations but fails on others

**Causes**:
- Token was granted fewer scopes than app requested
- User modified scopes during authorization
- Scope normalization caused scope to be missing

**Solution**:
1. Check which scopes token was actually granted
2. Request re-authorization with required scopes
3. User may need to grant additional scopes during re-auth

### Issue 4: OAuth Scope Limitations with Private Repos

**Symptom**: Cannot create read-only OAuth app access to private repos

**Causes**:
- GitHub does not provide read-only scope for private repositories
- `repo` scope includes both read and write permissions
- This is by design to prevent token fragmentation

**Solution - Choose One**:
1. **Option A**: Accept write access with `repo` scope
2. **Option B**: Use fine-grained PATs with read-only "Contents" permission
3. **Option C**: Use GitHub Apps (preferred) with fine-grained permissions

**Important Note**: This is a known platform limitation, not a configuration error.

### Issue 5: Git Push Authentication Failures

**Symptom**: `fatal: Authentication failed` when pushing with OAuth token

**Causes**:
- Token doesn't have `repo` scope
- Token has expired
- SAML SSO session expired
- Token used incorrectly in git URL

**Solution**:
```bash
# Method 1: Verify token has repo scope
# Check token details on GitHub.com → Settings → Developer settings

# Method 2: Use token as HTTPS password
# Instead of: git push https://github.com/owner/repo.git
# Use: git push https://[token]@github.com/owner/repo.git

# Method 3: Configure git credential helper
git config credential.helper store
echo "https://[token]:x-oauth-basic@github.com" > ~/.git-credentials

# Method 4: Regenerate and re-authenticate
gh auth logout
gh auth login
```

---

## 5. Recent Changes & Best Practices (2026)

### GitHub's Direction: Moving Away from OAuth Apps

**Recommendation Shift**:
- GitHub **prefers GitHub Apps** over OAuth apps for new integrations
- OAuth apps still supported but less recommended
- Fine-grained PATs closing the gap for personal use cases

**Why GitHub Apps Are Better**:
- Fine-grained permissions (not broad OAuth scopes)
- More control over repository access (repository-specific)
- Short-lived tokens (automatic rotation)
- Better organizational visibility and control
- Webhooks support for event-driven workflows

### Best Practices for 2026

1. **For Organizations**: Use GitHub Apps instead of OAuth apps
2. **For Personal Access**: Use fine-grained PATs instead of classic PATs
3. **For OAuth Apps**: Always request minimal scopes needed
4. **For Private Repos**: Acknowledge the write-permission requirement with `repo` scope
5. **For Security**: Use mandatory expiration with fine-grained PATs
6. **For Troubleshooting**: Check SAML SSO status first, then app approvals

### Scope Request Strategy

When building OAuth apps:

```typescript
// Minimal request for public repos only
const scopes = ['public_repo']

// Minimal request for private repos (accepts write access)
const scopes = ['repo']

// For additional operations
const scopes = ['repo', 'user:email', 'read:org']

// Note: Avoid over-requesting scopes
// Users can modify scopes during authorization
```

---

## 6. Key Implementation Considerations

### For AA-coding-agent Application

Based on this research, your application should:

1. **Request `repo` Scope**: Necessary for private repo access + push capability
2. **Document the Tradeoff**: Explain to users that `repo` scope includes write access
3. **Implement SAML SSO Handling**: Check for SSO requirements and prompt re-auth if needed
4. **Handle Approval Flows**: Detect org-restricted access and guide user to request approval
5. **Provide Reauth Mechanism**: Implement `gh auth login` or OAuth re-authorization flow
6. **Consider GitHub Apps**: Evaluate migrating to GitHub Apps for future versions

### Secure Token Handling

```typescript
// Store OAuth tokens encrypted
const encryptedToken = encrypt(oauthToken)
await db.insert(users).values({ githubToken: encryptedToken })

// Retrieve and decrypt when needed
const decrypted = decrypt(user.githubToken)

// Use as HTTPS git credential (not in logs)
const gitUrl = `https://${decrypted}@github.com/owner/repo.git`

// Never log token value
logger.info('Git operation started') // Good
logger.info(`Git push with token: ${token}`) // Bad - never do this
```

---

## Sources

1. [Scopes for OAuth apps - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
2. [Authorizing OAuth apps - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
3. [How to Authenticate Git Push to GitHub Using a Token (2026 Practical Guide)](https://thelinuxcode.com/how-to-authenticate-git-push-to-github-using-a-token-2026-practical-guide/)
4. [Introducing fine-grained personal access tokens for GitHub - The GitHub Blog](https://github.blog/security/application-security/introducing-fine-grained-personal-access-tokens-for-github/)
5. [Fine-grained PATs are now generally available - GitHub Changelog](https://github.blog/changelog/2025-03-18-fine-grained-pats-are-now-generally-available/)
6. [Permissions required for fine-grained personal access tokens - GitHub Docs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
7. [About OAuth app access restrictions - GitHub Docs](https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions)
8. [Differences between GitHub Apps and OAuth apps - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
