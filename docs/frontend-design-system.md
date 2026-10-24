# Frontend design system and navigation

## Direction

CareerPilot should feel editorial, calm, and precise: deep ink surfaces, warm off-white backgrounds, a restrained teal accent, and data visualizations that explain rather than decorate. Avoid card grids as the default structure; use strong page headings, tables/timelines, split panes, and progressive disclosure. Gradients are limited to subtle atmospheric landing-page treatment.

Tokens use CSS variables shared by light/dark themes. Typography: `Manrope` for display/UI and `Source Serif 4` for selected long-form guidance, with system fallbacks. A 4 px spacing base, 8/12 px radii, visible 2 px focus rings, semantic colors meeting WCAG 2.2 AA, and motion under 200 ms with `prefers-reduced-motion` support.

Core primitives: Button, LinkButton, Input, Select, Checkbox, Dialog, Sheet, Menu, Tabs, Tooltip, Toast, Progress, Skeleton, StatusBadge, DataTable, EmptyState, ProblemCallout, Stepper, EvidenceQuote, ScoreExplanation, and ConfirmDestructiveAction. shadcn/ui provides accessible behavior; product styling lives in variants/tokens rather than page-local copies.

## Navigation

Public: Home → Product → Security → Pricing (later) → Sign in / Start. Authenticated desktop uses a compact left rail and top context bar: Overview, CVs, Opportunities, Coach, Assistant; Profile/Settings in the account menu. Mobile uses a labeled bottom bar for primary areas and a sheet for secondary actions.

```text
Overview
├─ onboarding / processing status / next best action
CVs
├─ library → version → extraction review → analysis report
Opportunities
├─ recommendations → job detail
└─ saved jobs
Coach
├─ setup → interview conversation → result
└─ history
Assistant
└─ conversation
Settings
├─ profile and job preferences
├─ security and sessions
└─ data, retention, export, deletion
```

Every async state has useful copy: upload progress; quarantined/scanning/extracting states; retryable vs terminal failures; provider unavailable; no matches; model budget/availability. Loading preserves layout. Errors retain user input and include a request ID. Job/CV scores always expose “How this was calculated.”

## Frontend architecture

Next.js App Router defaults to server components. TanStack Query handles authenticated client-side server state where polling/optimistic mutation is valuable; forms use schema validation aligned to OpenAPI-generated types. Server middleware protects navigation only for UX—FastAPI remains the security boundary. No access tokens in local/session storage. Analytics excludes form fields, CV text, chat messages, and job-description bodies.

Required accessibility checks include keyboard-only operation, landmarks/headings, error association, screen-reader status announcements, 200% zoom, reduced motion, touch targets, and Playwright/axe coverage of critical journeys.
