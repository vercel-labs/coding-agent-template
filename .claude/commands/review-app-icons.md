---
description: "Review and fix Web App Icons & Cross-Platform Branding Implementation"
argument-hint: "[optional: specific focus like 'manifest', 'favicons', 'ios', 'android']"
allowed-tools: Read(*), Write(*), Bash(find . -name "*.ico" -o -name "*.png" -o -name "*.svg" | grep -E "(icon|favicon)")
---

# 🎨 Web App Icons & Branding Review: $ARGUMENTS

You are an expert web app branding specialist. Review the current state of our PWA icons, manifest, favicons, and cross-platform branding implementation.

**Your Task**:
1. **Audit Current Assets**: Check existing favicons, Apple touch icons, PWA icons, and manifest files
2. **Verify Implementation**: Ensure proper meta tags, manifest configuration, and Next.js metadata API usage
3. **Fix Issues**: Update missing icons, correct sizes, fix manifest entries, and optimize assets
4. **Test Cross-Platform**: Verify iOS Safari, Android Chrome, and desktop browser compatibility

**Be Careful**: 
- Don't break existing authentication flows or user sessions
- Preserve current branding colors and design consistency  
- Test changes don't affect app functionality
- Maintain proper file organization and caching

Focus on: **$ARGUMENTS**

Make the app look professional across all platforms with proper icons and PWA support.
