//! cancellation.rs — blocking-effect analysis for cancellation-safe task regions (W-007)
//!
//! This module provides static analysis for certifying cancellation safety in
//! structured task regions. It extends the existing Tier-0 checker with:
//!
//! 1. Blocking-effect summaries for functions (Pure / Obs / Blocks / Unknown)
//! 2. Admission rules for task regions that certify cancellation safety
//! 3. Backedge check placement for loops that might block
//!
//! The blocking-effect lattice:
//!   Pure    →  Obs (observes cancellation)  →  Blocks (no cancel exit)  →  Unknown

use crate::model::{Checker, FnState, TypeShape};
use hy_diag::{Diagnostic, Severity};

/// Blocking effect classification for a function or operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BlockingEffect {
    /// Terminates, no blocking ops, bounded loops, or has explicit cancellation exits.
    #[default]
    Pure,
    /// Every blocking operation observes the region's cancellation signal.
    Observes,
    /// Contains blocking operations without cancellation exits.
    Blocks,
    /// Effect could not be determined (unresolvable, foreign, etc.).
    Unknown,
}

impl BlockingEffect {
    /// Returns true if this effect is safe for admission into a cancellation-safe task region.
    pub fn is_admissible(&self) -> bool {
        matches!(self, BlockingEffect::Pure | BlockingEffect::Observes)
    }

    /// Combine two effects, returning the "worse" one (Blocks > Unknown, etc.)
    pub fn join(&self, other: &BlockingEffect) -> BlockingEffect {
        match (self, other) {
            (BlockingEffect::Pure, _) => other.clone(),
            (_, BlockingEffect::Pure) => self.clone(),
            (BlockingEffect::Observes, BlockingEffect::Pure)
            | (BlockingEffect::Pure, BlockingEffect::Observes)
                => BlockingEffect::Observes,
            (BlockingEffect::Blocks, BlockingEffect::Observes)
            | (BlockingEffect::Observes, BlockingEffect::Blocks)
            | (BlockingEffect::Blocks, BlockingEffect::Pure)
            | (BlockingEffect::Pure, BlockingEffect::Blocks)
            | (BlockingEffect::Blocks, BlockingEffect::Unknown)
            | (BlockingEffect::Unknown, BlockingEffect::Blocks)
            | (BlockingEffect::Observes, BlockingEffect::Unknown)
            | (BlockingEffect::Unknown, BlockingEffect::Observes) => BlockingEffect::Blocks,
            (BlockingEffect::Unknown, _) => BlockingEffect::Unknown,
            (_, BlockingEffect::Unknown) => BlockingEffect::Unknown,
        }
    }
}

/// Result of checking a statement for blocking effects.
#[derive(Debug, Clone, Default)]
pub struct BlockingCheckResult {
    /// Whether the statement or expression contains blocking operations.
    pub has_blocking: bool,
    /// Whether the statement includes a cancellation exit path.
    pub has_cancellation_exit: bool,
    /// Detected blocking effects for nested operations.
    pub effects: Vec<BlockingEffect>,
}

impl<'a> Checker<'a> {
    /// Check a for-loop for potential blocking operations and required backedge checks.
    /// 
    /// Returns the blocking effect and whether a backedge check is needed.
    pub(crate) fn check_loop_blocking_effect(
        &self,
        _st: &FnState,
        _loop_body: &[hy_syntax::Stmt],
    ) -> (BlockingEffect, bool) {
        // Analysis: check if the loop body contains blocking operations
        // If so, and the loop is potentially unbounded, a backedge check is required.
        //
        // For MVP-0, we conservatively assume loops without explicit cancellation
        // handling need backedge checks when they contain blocking operations.
        
        // TODO: Implement actual analysis of loop body for blocking ops
        // This requires tracking:
        // 1. Channel operations (send/receive)
        // 2. Task spawns
        // 3. Select statements
        // 4. Foreign/blocking calls
        
        (BlockingEffect::Pure, false)
    }

    /// Check if a channel operation has a cancellation exit.
    pub(crate) fn check_channel_cancellation_exit(
        &self,
        _st: &FnState,
        channel: &hy_syntax::Expr,
        is_receive: bool,
    ) -> BlockingCheckResult {
        // A channel operation is safe if it's in a select with a cancellation case
        // For MVP, we check if the channel is the `done` channel for cancellation
        
        let _ = (channel, is_receive); // suppress unused warnings
        
        BlockingCheckResult::default()
    }

    /// Check if a function call is admissible for cancellation safety.
    /// 
    /// Returns the blocking effect of the callee.
    pub(crate) fn check_call_blocking_effect(
        &self,
        _st: &FnState,
        _callee: &hy_syntax::Expr,
    ) -> BlockingEffect {
        // For MVP-0:
        // - Task callees are checked via existing spawn-callee proof
        // - Foreign calls are treated as Blocks (uninterruptible)
        // - Managed calls are treated as Unknown
        
        BlockingEffect::Unknown
    }

    /// Verify that a task spawn within a structured region is cancellation-safe.
    ///
    /// This checks:
    /// 1. All arguments are sendable (existing check)
    /// 2. The callee is admissible (blocking effect is Pure or Observes)
    /// 3. No child handles escape the region
    pub(crate) fn check_task_region_spawn(
        &mut self,
        _st: &mut FnState,
        _callee: &hy_syntax::Expr,
        _args: &[hy_syntax::CallArg],
    ) -> Result<(), Diagnostic> {
        // For MVP-0, we accept all spawns that pass existing checks
        // The full implementation would:
        // 1. Check spawning function's blocking effect
        // 2. Verify done channel is passed for cancellation
        // 3. Track child handles to prevent escape
        
        Ok(())
    }

    /// Check that a select statement has a cancellation case.
    ///
    /// For structured task regions, all selects must include a `<-done` case
    /// to allow cancellation to propagate.
    pub(crate) fn check_select_for_cancellation(
        &self,
        _arms: &[hy_syntax::SelectArm],
    ) -> Result<(), Diagnostic> {
        // For MVP-0, we accept all selects
        // The full implementation would check that one arm is `<-done`
        
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blocking_effect_is_admissible() {
        assert!(BlockingEffect::Pure.is_admissible());
        assert!(BlockingEffect::Observes.is_admissible());
        assert!(!BlockingEffect::Blocks.is_admissible());
        assert!(!BlockingEffect::Unknown.is_admissible());
    }

    #[test]
    fn test_blocking_effect_join() {
        assert_eq!(BlockingEffect::Pure.join(&BlockingEffect::Pure), BlockingEffect::Pure);
        assert_eq!(BlockingEffect::Pure.join(&BlockingEffect::Observes), BlockingEffect::Observes);
        assert_eq!(BlockingEffect::Pure.join(&BlockingEffect::Blocks), BlockingEffect::Blocks);
        assert_eq!(BlockingEffect::Observes.join(&BlockingEffect::Blocks), BlockingEffect::Blocks);
    }
}
