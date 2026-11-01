// ============================================================================
// 41-unbounded-loop-reject — Checker corpus #41 (REJECT)
//
// PURPOSE: Demonstrate rejection of unbounded loop that cannot respond to
// cancellation without explicit backedge check.
//
// Pattern: Infinite loop without cancellation exit point.
//
// EXPECTED-VERDICT: REJECT A1c (or new diagnostic HYB-E3704)
// ============================================================================

fn polling_task(stop chan bool) {
    // Unbounded loop - needs cancellation check at backedge
    for {
        // Do work repeatedly
        fmt.println("working...")
        // No cancellation check!
    }
    // This code would never be reached
}

fn main() {
    stop := make(chan bool)
    task polling_task(stop)
    
    // Trigger cancellation
    stop <- true
}
