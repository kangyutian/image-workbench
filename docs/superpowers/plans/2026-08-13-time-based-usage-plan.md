# Time-Based Usage Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add administrator-only time-filtered usage analytics with day/week/month grouping and a trend view.

**Architecture:** Keep the existing usage ledger as the source of truth. Extend the server summary function with an optional date range and bucketed time series, then let the admin page request and render the selected range. Billing record timestamps determine cost buckets; task timestamps are used for task/result counts.

**Tech Stack:** Node.js ESM server, React/TypeScript, existing Node test runner, CSS.

## Global Constraints

- Do not expose API keys or billing credentials.
- Preserve the existing cumulative usage endpoint behavior when no range is supplied.
- Only authenticated administrators may access filtered usage data.
- Use China Standard Time for date-only filters and bucket labels.

### Task 1: Time-range aggregation

**Files:**
- Modify: `server/usageStats.mjs`
- Test: `server/usageStats.test.mjs`

- Add tested range normalization and daily/weekly/monthly buckets.
- Include task counts by task `createdAt`; include billed amount by billing record `createdAt`, falling back to task time.
- Return `timeSeries` and selected range metadata without changing existing account totals.

### Task 2: Filtered admin API

**Files:**
- Modify: `server.mjs`
- Modify: `server/usageApi.mjs`
- Modify: `src/authApi.ts`
- Test: `server/usageApi.test.mjs`

- Parse `from`, `to`, and `groupBy` query parameters.
- Validate dates and supported grouping values, returning HTTP 400 for invalid filters.
- Pass filters into `summarizeUsage` while preserving admin authorization.

### Task 3: Admin usage interface

**Files:**
- Modify: `src/AuthenticatedApp.tsx`
- Modify: `src/styles.css`

- Add quick ranges, custom date inputs, group-by selection, and apply action.
- Show selected range, trend bars, and filtered account rows.
- Keep refresh billing and existing cumulative summary behavior.

### Task 4: Verification and deployment

- Run the full test suite, production build, and diff check.
- Create a server backup excluding secrets, data, and dependencies.
- Deploy the release, restart `image-workbench.service`, and verify HTTP 200, admin authorization, and filtered response shape.
