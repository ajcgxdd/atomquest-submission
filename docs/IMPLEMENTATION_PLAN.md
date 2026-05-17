# Implementation Plan

## Checkpoint 1 - Demo Portal

Status: complete

Scope:

- Dependency-free browser app
- Role switcher for Employee, Manager, and Admin journeys
- Seeded data
- Local persistence
- Goal validation
- Approval workflow
- Quarterly updates
- Check-ins
- Completion dashboard
- Shared goals with Admin and Manager push support
- Shared KPI recipient lock rules: only weightage is editable
- Audit logs
- CSV export

## Checkpoint 2 - UI Refinement

Status: complete

Scope:

- Apply final UI instructions from the user
- Tune spacing and responsive behavior
- Add polished empty states
- Add light microcopy for form validation
- Verify each role journey visually in the browser

## Checkpoint 3 - Production Architecture

Status: planned

Scope:

- Migrate to Next.js App Router
- Add Prisma schema
- Replace localStorage with PostgreSQL
- Add server actions or API routes
- Add Auth.js role-based sessions
- Keep the same domain model and workflow rules

## Checkpoint 4 - Bonus Features

Status: planned

Scope:

- Analytics dashboard
- Manager effectiveness metrics
- Escalation execution log
- In-app notifications
- Optional Microsoft Entra ID design notes

## Judging Alignment

- Functionality: complete role journeys are available from a single demo URL.
- Adherence: must-have Phase 1 and Phase 2 rules are implemented in the demo workflow.
- User friendliness: role-based navigation, visible status badges, and form validation are included.
- Technical robustness: workflow logic is centralized and persisted.
- Cost optimization: zero-dependency frontend with a tiny static server for demos.
