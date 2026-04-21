# Three Mode Architecture

## Purpose
Define the long-term structure of the ELK Performance Monitor as a multi-mode system.

---

## The Three Modes

### 1. Embedded Mode (Primary Product)

The monitor runs inside the application.

Characteristics:
- full access to app lifecycle
- accurate state awareness
- ability to hook into internal events
- highest fidelity monitoring

This is the **primary long-term product direction**.

---

### 2. Hybrid Cooperative Mode

Multiple surfaces cooperate (parent, iframe, embedded monitor, extension).

Characteristics:
- shared event protocol
- source identification
- coordinated session understanding
- partial distributed awareness

This is the **long-term differentiator**.

---

### 3. Extension Mode (Companion)

The monitor runs externally as a Chrome extension.

Characteristics:
- no internal app access
- observes requests and runtime errors
- lightweight and portable
- useful for debugging and demos

This is the **entry point and support tool**, not the full product.

---

## Key Principle

Each mode:
- has different visibility
- has different guarantees
- must not pretend to know more than it does

---

## Architecture Direction

We will evolve toward:

- shared contracts (event shapes, identities)
- mode-specific adapters
- feature flags per capability
- progressive enhancement across modes

---

## Current State

- extension mode is implemented
- embedded mode foundation exists in root `src/`
- hybrid mode is conceptual only

---

## Near-Term Goal

Define:
- embedded integration shape
- event contracts
- boundaries between modes

Before expanding implementation.