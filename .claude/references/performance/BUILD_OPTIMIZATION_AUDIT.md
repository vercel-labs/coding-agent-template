# Build Optimization & Module Structure Audit

**Date**: December 28, 2025  
**Project**: Orbis (Next.js 16 + React 19 + Turbopack)  
**Scope**: Bundle size, tree shaking, code splitting, module resolution, asset optimization

---

## Executive Summary

**Current State**: Good baseline with Turbopack optimization and strategic dynamic imports. However, identified **5 high-priority** improvements that can reduce bundle size by ~50-80KB and improve tree shaking efficiency.

**Impact Tier**:
- **CRITICAL** (implement immediately): Barrel export refactoring, CommonJS require() conversion
- **HIGH** (next sprint): Image asset optimization, dynamic import improvements  
- **MEDIUM** (ongoing): Package import consolidation, module resolution optimization

---

## 1. CRITICAL: CommonJS require() in Hot Paths

**Issue**: Dynamic `require()` calls in `tool-renderer.tsx` prevent tree shaking and inline optimization.

**Location**: `/home/user/agentic-assets-app/components/chat/message-parts/tool-renderer.tsx` (lines 14, etc.)

```typescript
// CURRENT (blocks tree shaking)
const { Weather } = require("../../weather");
const { DocumentPreview } = require("../../artifacts/document-preview");
const { DocumentToolCall, DocumentToolResult } = require("../../artifacts/document");
```

**Problem**:
- Runtime require() prevents webpack/Turbopack from analyzing imports at build time
- Prevents code splitting and dead code elimination
- Hot path: executed for every tool render

**Recommendation**: Convert to dynamic imports
```typescript
// OPTIMIZED
import { lazy, Suspense } from 'react';
const Weather = lazy(() => import("../../weather").then(m => ({ default: m.Weather })));
const DocumentPreview = lazy(() => import("../../artifacts/document-preview").then(m => ({ default: m.DocumentPreview })));
```

**Expected Impact**: 
- Enable proper code splitting for tool components (~15KB savings)
- Improve build-time tree shaking analysis
- Enable Turbopack to detect unused tool renderers

**Priority**: CRITICAL - Affects message rendering performance

---

## 2. CRITICAL: Barrel Export Optimization

**Issue**: Multiple barrel exports export ALL components, preventing selective tree shaking.

**Affected Files**:

| File | Count | Issue |
|------|-------|-------|
| `components/landing-page/sections/index.ts` | 5 exports | Re-exports all sections (5 exports) |
| `components/ic-memo/index.ts` | 8 exports | All workflow steps exported together |
| `components/market-outlook/index.ts` | 8 exports | All steps exported |
| `components/paper-review/index.ts` | 8 exports | All steps exported |
| `lib/voice/index.ts` | 40+ exports | Massive re-export barrel |
| `lib/auth/index.ts` | 8 exports | All auth utilities |
| `lib/mcp/tools/index.ts` | 11 imports + exports | All tools registered |

**Example - `components/landing-page/sections/index.ts`**:
```typescript
export { AboutSection } from './about-section';
export { OrbisSection } from './orbis-section';
export { InsightsSection } from './insights-section';
export { TeamSection } from './team-section';
export { ContactSection } from './contact-section';
```

**Problem**:
- When importing `{ TeamSection }` from barrel, bundler may include all 5 sections
- TypeScript config doesn't have `exports` field to guide tree shaking
- Workflow step imports: importing one step pulls all 8 steps

**Recommendation**:

### A. Direct Imports (Preferred)
Replace:
```typescript
import { AboutSection } from "@/components/landing-page/sections";
```

With:
```typescript
import { AboutSection } from "@/components/landing-page/sections/about-section";
```

### B. Conditional/Lazy Step Registration
For workflow steps, use lazy registration:
```typescript
// lib/workflows/step-registry.ts
const StepComponent = dynamic(
  () => import(`../path/to/${stepName}`),
  { ssr: false }
);
```

### C. Add package.json exports (if multiple packages)
```json
{
  "exports": {
    "./landing-page/sections": {
      "import": "./components/landing-page/sections/index.ts"
    },
    "./landing-page/sections/about": "./components/landing-page/sections/about-section.tsx"
  }
}
```

**Migration Strategy**:
1. Update landing page imports first (high-traffic page)
2. Update workflow pages (8 step components × 4 workflows = 32 potential imports)
3. Update voice module imports (selective usage)

**Expected Impact**:
- 30-50KB bundle size reduction (fewer unused components bundled)
- Faster build times (better tree shaking analysis)
- More precise code splitting boundaries

**Priority**: CRITICAL - Affects main landing and workflow pages

---

## 3. HIGH: Image Asset Optimization

**Issue**: Large PNG screenshots not optimized for web delivery.

**Current Assets**:

| File | Size | Type | Optimization |
|------|------|------|--------------|
| `public/Orbis-screenshot-document.png` | 540KB | PNG | No compression |
| `public/Orbis-screenshot-document-wide.png` | 557KB | PNG | No compression |
| `public/Orbis-screenshot-document copy.png` | 560KB | PNG | No compression |
| `public/orbis-logo.png` | 101KB | PNG | No compression |
| `public/agentic-logo.png` | 61KB | PNG | No compression |

**Problems**:
- **Missing WebP/AVIF**: next.config.ts configures WebP/AVIF but images aren't served in optimized formats
- **No lazy loading**: Landing page screenshots loaded eagerly
- **Duplicate file**: "Orbis-screenshot-document copy.png" unused
- **No compression**: PNG files at original size (likely UI renders saved as PNG)

**Recommendation**:

### A. Convert to Modern Formats
```bash
# Install tools
pnpm add -D imagemin imagemin-webp imagemin-avif

# Convert existing
npx imagemin public/*.png --plugin=webp --out-dir=public/webp
npx imagemin public/*.png --plugin=avif --out-dir=public/avif
```

### B. Use Next.js Image Component
```typescript
// Current (unoptimized)
<img src="/Orbis-screenshot-document.png" alt="..." />

// Optimized
import Image from "next/image";
<Image
  src="/Orbis-screenshot-document.png"
  alt="Orbis preview"
  width={1970}
  height={1265}
  priority={false}  // Lazy load below-the-fold
  placeholder="blur"
  blurDataURL="data:image/..." // Low-quality placeholder
/>
```

### C. Implement Responsive Images
```typescript
<Image
  src="/Orbis-screenshot-document.png"
  alt="..."
  width={2382}
  height={1267}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
  quality={75}  // Reduce quality for docs/marketing images
/>
```

### D. Remove Duplicate
Delete: `public/Orbis-screenshot-document copy.png`

**Expected Impact**:
- 60-70% size reduction per image (540KB → 150-180KB with WebP)
- Faster landing page load (defer below-the-fold images)
- Automatic format negotiation (WebP for Chrome, AVIF for Safari)

**Priority**: HIGH - 1.6MB+ savings potential

---

## 4. HIGH: Next.js Image Component Adoption

**Current State**: 
- **13 files** use `import Image from 'next/image'`
- Many image imports not found in grep (using `<img>` tags or undefined usage)
- Landing page and team section use Image component well

**Issue**: Unoptimized `<img>` tags throughout codebase

**Recommendation**:
1. Audit all `<img>` tags: `grep -r "<img" /home/user/agentic-assets-app/components /home/user/agentic-assets-app/app`
2. Replace with `<Image />` from `next/image`
3. Add `placeholder="blur"` for above-the-fold images
4. Add `loading="lazy"` for below-the-fold

**Expected Impact**: 
- Automatic format negotiation (WebP/AVIF)
- Built-in lazy loading
- Responsive image sizing

**Priority**: HIGH

---

## 5. MEDIUM: Large Component Code Splitting

**Issue**: Several components exceed 1000 LOC, blocking code splitting.

**Files**:

| Component | Lines | Issue | Solution |
|-----------|-------|-------|----------|
| `message.tsx` | 3,680 | Tool rendering logic mixed with message UI | Extract tool rendering |
| `multimodal-input-v2.tsx` | 1,625 | Input + file handling + AI calls | Split into smaller files |
| `prompt-input.tsx` | 1,359 | Complex form handling | Extract into subcomponents |
| `icons.tsx` | 1,284 | Icon library (not a component) | OK for library files |
| `data-table.tsx` | 1,131 | DataGrid + sorting + filtering | Extract filters/sorting |
| `sidebar.tsx` | 1,041 | Layout + sidebar state | Layout is OK (single file) |

**Recommendation**: Extract tool rendering from message.tsx
```typescript
// Current structure
components/chat/message.tsx (3,680 LOC)
├─ Render message parts
├─ Render tools
├─ Render artifacts
├─ Handle citations

// Optimized structure  
components/chat/message.tsx (2,000 LOC) - Core message rendering
├─ Message header/content
├─ Use tool-renderer
components/chat/message-parts/ (existing)
├─ tool-renderer.tsx (refactored, ~300 LOC)
```

**Expected Impact**: 
- Enable per-page code splitting for message components
- Faster chat page load (defer tool rendering)

**Priority**: MEDIUM - Lower impact than barrel exports

---

## 6. MEDIUM: Dynamic Route-Based Code Splitting

**Current Implementation**: Good
- ✅ Landing page lazy loads WebGL (`LazyGL = dynamic(...)`)
- ✅ Workflow steps lazy loaded via `createWorkflowStepRegistry()`
- ✅ Artifact panel uses dynamic imports

**Opportunities**:

### Missing Lazy Boundaries:
1. **Workflow pages** - All 4 workflows (IC Memo, Market Outlook, Paper Review, LOI) are in main bundle
   ```typescript
   // Add to app/(chat)/workflows/[workflow]/page.tsx
   const WorkflowComponent = dynamic(
     () => import(`@/components/${workflow}`),
     { ssr: false, loading: () => <Skeleton /> }
   );
   ```

2. **Settings modal** (882 LOC) - Loaded eagerly in chat layout
   ```typescript
   const SettingsModal = dynamic(
     () => import('@/components/modals/settings-modal'),
     { ssr: false }
   );
   ```

3. **Data export** (628 LOC) - Loaded for every artifact
   ```typescript
   const DataExport = dynamic(
     () => import('@/components/data-table/data-export'),
     { loading: () => null }
   );
   ```

**Expected Impact**: 
- 50-100KB deferred load for rarely-used features
- Faster initial page load

**Priority**: MEDIUM

---

## 7. MEDIUM: optimizePackageImports Expansion

**Current Configuration** (next.config.ts):
```typescript
optimizePackageImports: [
  "lucide-react",
  "@radix-ui/react-icons",
  "@ai-sdk/react",
  "ai",
  "three",
  "@react-three/fiber",
  "recharts",
  "react-icons",
  "streamdown",
  "mermaid",
  "codemirror",
  "@codemirror/view",
  "@codemirror/state",
  "prosemirror-view",
  "prosemirror-markdown",
],
```

**Recommendations**:

### Add Missing Heavy Packages:
```typescript
optimizePackageImports: [
  // ... existing
  "@supabase/supabase-js",      // 400KB+ - only use specific modules
  "recharts",                     // 200KB+ - chart library
  "framer-motion",               // 50KB+ - animation library
  "@tanstack/react-table",       // data table internals
  "date-fns",                    // date utilities (selective imports)
  "papaparse",                   // CSV parser
  "marked",                      // markdown parser
  "katex",                       // math rendering
],
```

**Impact**: Turbopack will only bundle imported exports from these packages.

**Priority**: MEDIUM

---

## 8. LOW: Module Resolution Optimization

**Current tsconfig.json**:
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

**Status**: Already optimal
- ✅ `moduleResolution: "bundler"` is correct for Next.js
- ✅ Single `@/*` path alias (minimal overhead)
- ✅ No deep path aliases (`@/lib/ai/tools/...` is not defined)

**No action required** - This is already well-configured.

---

## 9. Build Configuration Assessment

**Current next.config.ts**:

| Feature | Status | Impact |
|---------|--------|--------|
| Bundle analyzer | ✅ Enabled | Good for debugging |
| Turbopack persistent cache | ✅ Enabled | 20-30% faster rebuilds |
| optimizePackageImports | ✅ Enabled (15 packages) | 50-80KB savings |
| Image optimization | ✅ Configured | WebP/AVIF support |
| Webpack optimization | ✅ Deterministic moduleIds | Consistent hashes |

**Recommendations**:
1. Add `experimental.turbopackFileSystemCache` (already done ✅)
2. Add source maps only in dev: Already configured via Turbopack defaults

**Status**: Well-configured. No major changes needed.

---

## 10. CSS & Asset Import Optimization

**Current CSS Imports** (all legitimate):

| Import | Package | Issue | Solution |
|--------|---------|-------|----------|
| `@xyflow/react/dist/style.css` | XYFlow | Large CSS file | Keep (feature dependency) |
| `react-data-grid/lib/styles.css` | React Data Grid | Needed | Keep (feature dependency) |
| `app/landing-page.css` | Custom | Scoped to landing page | ✅ Good |
| `app/globals.css` | Custom | Global | ✅ Good |

**Status**: All legitimate. No inline CSS bloat detected.

---

## Action Plan (Priority Order)

### PHASE 1 (Week 1) - Critical Fixes
- [ ] Convert `require()` to dynamic imports in `tool-renderer.tsx`
- [ ] Update landing page section imports to direct paths
- [ ] Remove duplicate screenshot file (`Orbis-screenshot-document copy.png`)

**Expected savings**: 15-20KB + better tree shaking

### PHASE 2 (Week 2) - Image Optimization  
- [ ] Convert large PNGs to WebP/AVIF
- [ ] Add Image component to unoptimized img tags
- [ ] Implement lazy loading for screenshots

**Expected savings**: 800KB-1.2MB

### PHASE 3 (Week 3) - Code Splitting
- [ ] Extract tool rendering from message.tsx
- [ ] Lazy load workflow pages by route
- [ ] Lazy load settings modal

**Expected savings**: 50-100KB deferred

### PHASE 4 (Week 4+) - Module Cleanup
- [ ] Add exports field to package.json (if publishing modules)
- [ ] Expand optimizePackageImports for new packages
- [ ] Profile bundle with `ANALYZE=true pnpm build`

---

## Verification Commands

```bash
# Analyze bundle
ANALYZE=true pnpm build

# Check imports after refactoring
grep -r "require(" /components /app --include="*.tsx"

# Find unoptimized images
grep -r "<img" /components /app --include="*.tsx" | head -20

# Measure bundle size before/after
ls -lh .next/static/chunks/

# Tree-shaking verification (check for unused exports)
pnpm build 2>&1 | grep -i "unused\|side.effect"
```

---

## Summary Table

| Priority | Category | Item | Impact | Effort |
|----------|----------|------|--------|--------|
| 🔴 CRITICAL | Code | CommonJS require() | 15KB | 1 hour |
| 🔴 CRITICAL | Imports | Barrel export refactoring | 30-50KB | 2-3 hours |
| 🔴 HIGH | Assets | Image optimization (WebP/AVIF) | 800KB-1.2MB | 2 hours |
| 🔴 HIGH | Images | Next.js Image adoption | 5-10% faster | 2-3 hours |
| 🟡 MEDIUM | Splitting | Component code splitting | 50-100KB | 4-6 hours |
| 🟡 MEDIUM | Routes | Workflow lazy loading | 50KB deferred | 1-2 hours |
| 🟡 MEDIUM | Config | optimizePackageImports expansion | 20-30KB | 30 mins |
| 🟢 LOW | Config | Module resolution | Already optimal | 0 |

**Total Potential Savings**: 1-1.4MB + deferred loading + improved tree shaking

---

## References

- Next.js 16 Optimization: https://nextjs.org/docs/app/building-your-application/optimizing
- Turbopack Configuration: https://turbo.build/pack/docs/optimizing-package-imports
- Image Optimization: https://nextjs.org/docs/app/building-your-application/optimizing/images
- Tree Shaking Guide: https://webpack.js.org/guides/tree-shaking/
