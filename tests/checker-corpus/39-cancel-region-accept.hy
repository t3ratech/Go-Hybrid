// ============================================================================
// 39-cancel-region-accept — Checker corpus #39 (ACCEPT)
// 
// PURPOSE: Demonstrate acceptance of a cancellation-safe task region pattern.
// This program shows proper cancellation handling in task operations.
//
// Pattern: Task region with proper cancellation exit via done channel.
//
// EXPECTED-VERDICT: ACCEPT
// ============================================================================

fn worker(id int, jobs chan int, results chan int, done chan bool) {
    for job in <-jobs {
        select {
        case results <- job * id:
        case <-done:
            fmt.println("worker {id} cancelled")
            return
        }
    }
}

fn main() {
    jobs := make(chan int)
    results := make(chan int)
    done := make(chan bool)
    
    for i in 0..3 {
        task worker(i, jobs, results, done)
    }
    
    // Feed jobs
    for j in 0..10 {
        jobs <- j
    }
    close(jobs)
    
    // Collect results with cancellation check
    for i in 0..10 {
        select {
        case r := <-results:
            // process result
        case <-done:
            cancel()
        }
    }
    
    done <- true
    fmt.println("completed")
}
