# Quick Start: Build Optimization

**Last Updated**: December 28, 2025

## Key Findings

**Total Potential Savings**: 1-1.4MB bundle + deferred loading + improved tree shaking

### The 5 Biggest Issues

1. **CommonJS require() in hot paths** (Critical)
   - File: `components/chat/message-parts/tool-renderer.tsx`
   - Fix: Convert to dynamic imports
   - Savings: 15KB + better tree shaking

2. **Barrel exports preventing tree shaking** (Critical)
   - Files: `components/landing-page/sections/index.ts`, workflow component indices
   - Fix: Use direct imports instead of barrel exports
   - Savings: 30-50KB

3. **Unoptimized PNG screenshots** (High)
   - Files: `public/Orbis-screenshot-*.png` (540KB+ each)
   - Fix: Convert to WebP/AVIF format
   - Savings: 800KB-1.2MB

4. **Missing lazy loading on heavy components** (High)
   - Files: Settings modal (882 LOC), data export (628 LOC)
   - Fix: Use dynamic imports
   - Savings: 50-100KB deferred

5. **Missing Next.js Image optimization** (High)
   - Files: Unoptimized `<img>` tags throughout
   - Fix: Replace with Next.js Image component
   - Savings: 5-10% faster load + format negotiation

## Implementation Priority

### Week 1 - Critical (1-2 hours)
```bash
# 1. Fix require() calls in tool-renderer.tsx
# Replace: const { Weather } = require("../../weather");
# With: const Weather = lazy(() => import("../../weather").then(m => ({ default: m.Weather })));

# 2. Update landing page imports
# Replace: import { AboutSection } from "@/components/landing-page/sections";
# With: import { AboutSection } from "@/components/landing-page/sections/about-section";

# 3. Remove duplicate screenshot
# rm public/Orbis-screenshot-document\ copy.png
```

### Week 2 - High (2-3 hours)
```bash
# 1. Install image optimization tools
pnpm add -D imagemin imagemin-webp imagemin-avif

# 2. Convert PNGs to WebP
npx imagemin public/*.png --plugin=webp --out-dir=public/webp

# 3. Update landing page to use Next.js Image with lazy loading
# See audit report for detailed implementation
```

### Week 3-4 - Medium (4-6 hours)
- Extract tool rendering from message.tsx
- Add lazy loading boundaries for workflow pages
- Expand optimizePackageImports config

## Verification

```bash
# Before: Measure baseline
ls -lh .next/static/chunks/

# After changes: Compare bundle size
ANALYZE=true pnpm build

# Check for remaining require() calls
grep -r "require(" /components /app --include="*.tsx"

# Find unused barrel exports
grep -r "from.*index" /components /app --include="*.tsx" | head -20
```

## Files to Modify

**Critical** (PHASE 1):
- `/home/user/agentic-assets-app/components/chat/message-parts/tool-renderer.tsx`
- `/home/user/agentic-assets-app/app/page.tsx` (landing page imports)
- `/home/user/agentic-assets-app/public/` (remove duplicate screenshot)

**High** (PHASE 2):
- `public/*.png` (convert to WebP/AVIF)
- `components/landing-page/**/*.tsx` (add Image optimization)
- `next.config.ts` (expand optimizePackageImports)

**Medium** (PHASE 3-4):
- `components/chat/message.tsx` (extract tool rendering)
- `components/modals/settings-modal.tsx` (lazy load)
- Workflow pages (lazy load by route)

## Related Documentation

Full audit report: `.claude/references/performance/BUILD_OPTIMIZATION_AUDIT.md`

## Quick Links

- Turbopack optimizePackageImports: https://turbo.build/pack/docs/optimizing-package-imports
- Next.js Image: https://nextjs.org/docs/app/building-your-application/optimizing/images
- Dynamic imports: https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading
