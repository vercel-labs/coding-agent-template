---
description: "Review and analyze authentication system, middleware, and Supabase clients"
argument-hint: "[optional: specific focus like 'middleware', 'supabase', 'session', 'security']"
allowed-tools: Read(*), Bash(find . -name "*middleware*" -o -name "*auth*"), Bash(grep -r "supabase\|createClient" --include="*.ts" lib/ app/)
---

# 🔐 Authentication & Middleware Review: $ARGUMENTS

You are a senior authentication security specialist. Review our auth system, middleware implementation, and Supabase client architecture.

**Your Task**:
1. **Audit Auth Flow**: Check middleware.ts, session handling, route protection, and redirect logic
2. **Review Supabase Integration**: Analyze client singletons, server vs client usage, and connection management  
3. **Security Assessment**: Verify proper session validation, CSRF protection, and secure cookie handling
4. **Performance Check**: Ensure efficient middleware execution and optimal client instantiation

**Be Careful**:
- Don't break existing user sessions or login flows
- Preserve current authentication state and user data
- Test all changes thoroughly before implementing
- Maintain backward compatibility with existing auth patterns

Focus on: **$ARGUMENTS**  

Ensure robust, secure, and performant authentication throughout the application.
