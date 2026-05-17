# AtomQuest Goal Setting & Tracking Portal

> **AtomQuest Hackathon 1.0 Implementation Checkpoint**

A dependency-free, locally-runnable demonstration of a comprehensive Goal Setting and Tracking Portal. This prototype implements the complete lifecycle management for Employee, Manager, and Admin personas, designed specifically for the AtomQuest Hackathon problem statement.

## Quick Start (Running Locally)

To see the portal in action immediately:

```bash
# Start the local server
node server.js
```
Then, open your browser and navigate to `http://127.0.0.1:5174`.

## Demo Personas

The application features a built-in "User Switcher" (top-right corner) to easily traverse the different roles and workflows:

- **Employee:** Asha Mehta (Draft state, ready for goal creation demonstration)
- **Employee:** Neel Shah (Active state, ready for checking-in updates)
- **Employee:** Maya Rao (Submitted state, pending manager approval)
- **Manager:** Ravi Iyer (Approval routing, check-ins, tracking)
- **Admin / HR:** Priya Nair (Cycle management, dashboards)

## Features Implemented

### Phase 1: Goal Setting & Approvals
- **Goal Scaffolding:** Create goals defining thrust area, title, description, UoM, target, and weightage.
- **Robust Validation:** Enforces business rules seamlessly (Total weightage = 100%, Min 10% per goal, Max 8 goals).
- **Manager Workflows:** Complete approval workflow with inline target and weightage editing, plus return-for-rework flows with mandatory manager notes.
- **Shared Goals & Inheritance:** Admins and Managers can push shared goals to teams. Recipients can only edit weightages; core KPI definitions remain locked.
- **State Locking:** Submitted sheets are read-only for employees until returned, and fully locked after manager approval.

### Phase 2: Tracking & Governance
- **Quarterly Achievement:** Dedicated capture windows for quarterly progress updates.
- **UoM-Specific Validation:** Tailored progress scoring based on Min, Max, Timeline, and Zero-based UoMs.
- **Structured Check-ins:** Managers log structured check-ins including discussion summaries, blockers, and next actions.
- **Planned vs Actual View:** Goal-level "Planned vs Actual" tracking system for managers.
- **Admin Dashboards:** Comprehensive cycle management, completion dashboards, CSV achievement exports, rule-based escalation configurations, and an audit trail for major events.

## Technical Architecture & Production Migration

For the hackathon demonstration, this prototype strategically utilizes **HTML/JS** with **`localStorage`** to ensure a zero-friction demo without complex infrastructure setups or dependencies.

The intended production stack designed for scaling is:

- **Frontend:** Next.js + TypeScript
- **Database:** PostgreSQL modeled via Prisma ORM
- **Authentication:** Auth.js / NextAuth (ready for Microsoft Entra ID)
- **Styling:** Tailwind CSS + shadcn/ui
- **Data Visualization:** Recharts
- **Hosting:** Vercel + Neon or Supabase Postgres

---
