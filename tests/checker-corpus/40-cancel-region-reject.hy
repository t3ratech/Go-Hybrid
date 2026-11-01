// ============================================================================
// 40-cancel-region-reject — Checker corpus #40 (REJECT)
//
// PURPOSE: Demonstrate rejection of unsafe cancellation pattern - blocking
// operation without cancellation exit.
//
// Pattern: Task spawn with value that cannot observe cancellation.
//
// EXPECTED-VERDICT: REJECT A1c
// ============================================================================

fn blocking_task(data map[string]int) {
    // This task writes to shared state without cancellation handling
    for k, v in data {
        data[k] = v * 2  // shared mutable state without sync
    }
}

fn main() {
    // Shared map - needs managed or proper isolation
    shared := map[string]int{"a": 1, "b": 2}
    
    // Spawn task with shared mutable state - unsafe
    task blocking_task(shared)  // REJECT: shared mutable map
    
    // This would be safe with proper isolation:
    // task blocking_task(move shared)  // move ownership
    // OR
    // managed("shared state", "mutex") { ... }
}
