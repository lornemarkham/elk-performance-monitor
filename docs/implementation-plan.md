# Implementation Plan

## Purpose
Define a phased, controlled path from current working extension to a multi-mode monitor system.

---

## Phase 1: Stabilize Foundation (Current)

Goals:
- clean repo structure
- define folder responsibilities
- define MVP scope per mode
- stabilize extension build and runtime

Status:
- in progress

---

## Phase 2: Embedded Integration Definition

Goals:
- define how an app installs the monitor
- define init API (e.g. `initMonitor`)
- define feature flags / capabilities
- define event ingestion shape

Output:
- `embedded-integration-shape.md`

---

## Phase 3: Shared Contracts

Goals:
- define event types
- define request / error structures
- define source identity (`page`, `extension`, `parent`, `child`)

Important:
Only extract shared code when it is truly used by multiple modes.

---

## Phase 4: Embedded Mode MVP

Goals:
- working embedded monitor
- richer UI than extension
- real lifecycle awareness
- clean install pattern

---

## Phase 5: Hybrid Mode (Early)

Goals:
- define parent/child communication direction
- basic shared session understanding
- avoid over-promising capabilities

---

## Phase 6: Extension Enhancement

Goals:
- align extension with shared contracts
- improve UI and stability
- keep scope honest

---

## Guiding Principles

- plan before refactor
- small, reversible steps
- no fake shared abstractions
- no pretending extension == embedded
- clarity over cleverness

---

## Current Focus

We are currently:
- finishing repo structure
- defining responsibilities
- preparing for embedded integration design