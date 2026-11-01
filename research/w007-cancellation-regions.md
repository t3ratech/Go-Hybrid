# W-007: Cancellation-Ssafe Structured Task Regions via Blocking-Effect Admission

**Research: Certify cancellation-safe structured task regions through blocking-effect admission**

## Executive Summary

This research analyzes the design space for certifying cancellation safety in structured task regions within the Hybrid language. The approach treats cancellation safety as an admission rule for opt-in task regions, using compositional blocking-effect summaries.

## Goals

1. Allow the compiler to certify that a structured task region's cancellation is safe
2. Prove that cancellation reaches every spawned child
3. Prove that every potentially blocking operation has a cancellation exit
4. Prove that the region joins its children before releasing resources

## Design Approach

### 1. Opt-In Region Syntax

```
// Proposed syntax (provisional)
task region {
    // All task spawns and channel ops here
    // are under cancellation verification
}
```

### 2. Blocking-Effect Lattice

Functions get compositional cancellation-effect summaries from this lattice:

```
Pure    →  Obs (observes cancellation)  →  Blocks (no cancel exit)  →  Unknown
```

- **Pure**: Terminates, no blocking ops, bounded loops
- **Obs**: Every blocking op observes region's done channel
- **Blocks**: Some blocking op has no cancellation exit
- **Unknown**: Unresolved callee, foreign/managed call

### 3. Admission Rules

| Construct | Rule |
|-----------|------|
| `task f(args)` in region | Requires `eff(f) ∈ {Pure, Obs}` AND child handle not escapable |
| `x <- v` / `<-x` | Must be in select with `<-done` case |
| `select` | Must contain a cancel case |
| `for` loops | Need cancellation check at backedge unless body contains blocking op |
| `call g(...)` | Requires `eff(g) ∈ {Pure, Obs}` |

### 4. Error Codes (Proposed)

- `HYB-E3701`: Uninterruptible foreign/unsummarized call in task region
- `HYB-E3702`: Escaping child task handle from region
- `HYB-E3703`: Unguarded blocking operation in region
- `HYB-E3704`: Unchecked unbounded loop in region

## Implementation Strategy

### Compiler Extensions Required

1. **Syntax**: Add `task_region` statement type
2. **Checker**: Add blocking-effect analysis pass
3. **Summaries**: Per-function blocking-effect summaries
4. **Regions**: Track region context with cancellation token
5. **Emission**: Generate supervisor wrapper for region lowering

### Connection to Existing Infrastructure

- **Sendability rules (O4)**: Block effect summaries extend this framework
- **Freeze tracking (O5)**: Region resources must be frozen at exit
- **Loop analysis (W-006)**: Backedge checks already planned
- **Two-tier blocking (Spike 4)**: Runtime mechanics exist

## Positive Cases (Must Accept)

### Case 1: Pipeline with producer blocked on send
```hy
// When producer blocks on send, cancellation exits via select case
task producer(ch, done) {
    for item in items {
        select {
        case ch <- item:  // normal send
        case <-done: return // cancel exit
        }
    }
}
```

### Case 2: Consumer blocked on receive
```hy
// Consumer unblocks via done channel
task consumer(ch, results, done) {
    for item in <-ch {
        select {
        case results <- process(item):
        case <-done: return // cancel exit
        }
    }
}
```

### Case 3: Compute loop with backedge check
```hy
// Loop checks cancellation, joins children before cleanup
task_region {
    sup := wait_group{}
    ctx, cancel := context.with_cancel(context.background())
    defer cancel()
    
    for i in 0..n {
        sup.add(1)
        go func(i int) {
            defer sup.done()
            // check ctx at loop backedge
        }(i)
    }
    sup.wait() // join before resources released
}
```

## Falsification Cases (Must Reject)

### Case 1: Uninterruptible foreign call
```hy
task_region {
    // foreign call with no cancel exit - rejected
    foreign_blocking_call()
}
```

### Case 2: Escaping goroutine
```hy
task_region {
    // handle escapes region - rejected
    h := spawn_orphan_task()
    store_outside_region(h)
}
```

### Case 3: Nested select without cancel
```hy
task_region {
    select {
    case ch <- v:  // no done case
    case <-timeout:
    }
}
```

### Case 4: Blocking cleanup
```hy
task_region {
    managed {
        // cleanup that can block - rejected
        blocking_cleanup()
    }
}
```

## Plain-Go Lowering

An admitted region lowers to ordinary Go with:
- `context.WithCancel` for cancellation
- `sync.WaitGroup` for joining
- Select multiplexing for channel ops
- Loop backedge checks

```go
{
    var sup sync.WaitGroup
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    
    sup.Add(1)
    go func() {
        defer sup.Done()
        for i := 0; ; i++ {
            select {
            case <-ctx.Done():
                return
            default:
                // work
                if some_condition {
                    return
                }
            }
        }
    }()
    sup.Wait()
}
```

## Cost Analysis

- Backedge checks: minimal overhead (untaken predicted branch)
- Supervision: standard Go patterns (context, WaitGroup)
- Summary computation: compile-time only, no runtime cost

## Related Work

- **W-006**: Loop backedge checks for cancellation
- **W-005**: Message isolation for task boundaries
- **W-008**: Settlement accounting for task regions
- **Spike 4**: Two-tier blocking for foreign calls

## Conclusion

This design provides a path to certifying cancellation safety through blocking-effect admission, extending Hybrid's existing Tier-0 verification framework. The approach is opt-in and conservative, ensuring safety properties are statically provable.
