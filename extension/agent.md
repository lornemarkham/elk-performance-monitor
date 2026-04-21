# Monitor Project Rules

## Core Principles
- One shared monitor core (no duplicated logic)
- Extension and embedded modes are NOT the same
- Never fake data or overstate certainty
- Prefer real signals over assumptions

## Architecture Rules
- Shared logic lives in /shared
- Extension-specific logic lives in /extension
- Embedded-specific logic lives in /embedded
- Do not mix responsibilities

## Coding Rules
- No render loops (be careful with state + effects)
- Derived data stays in useMemo, not global state
- Do not create new objects in snapshots unnecessarily
- Keep components focused and small

## Feature Development
Before adding anything, decide:
- Is this shared?
- Extension-only?
- Embedded-only?
- Hybrid?

## Goal
Build a stable MVP coworkers can use and extend.