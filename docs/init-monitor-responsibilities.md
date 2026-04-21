# initMonitor Responsibilities

## Purpose
Define what the startup entry point owns and what it delegates.

## initMonitor should own
- accepting config
- validating/normalizing config later
- registering startup metadata
- calling setup functions in the right order
- deciding which features initialize based on config

## initMonitor should not own
- raw fetch/XHR patch implementation
- raw error listener logic
- UI rendering details
- page-world injection internals
- large business logic

## Expected startup order
1. record startup config / mode
2. inject page-world if needed
3. initialize store/config state
4. initialize enabled instrumentation
5. mount or expose UI entry points
6. attach listeners

## Future delegated modules
- network setup
- error setup
- UI bootstrap
- feature flag resolution
- embedded lifecycle hooks

## Success criteria
- startup is understandable
- responsibilities are not mixed
- future modes can follow the same pattern