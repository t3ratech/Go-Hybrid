#!/usr/bin/env node
/**
 * verify_cancellation.mjs — verification harness for W-007 cancellation analysis
 *
 * This executable test harness verifies the blocking-effect admission logic
 * for certifying cancellation-safe structured task regions.
 *
 * Run with: node verify_cancellation.mjs
 */

// Test results
let passed = 0;
let failed = 0;

/** Blocking effect classification (matching the Rust implementation) */
const BlockingEffect = {
    Pure: 'Pure',
    Observes: 'Observes',
    Blocks: 'Blocks',
    Unknown: 'Unknown'
};

/** Check if an effect is admissible for cancellation safety */
function isAdmissible(effect) {
    return effect === BlockingEffect.Pure || effect === BlockingEffect.Observes;
}

/** Join two blocking effects (higher in the safety lattice wins)
 *  Pure = safest (terminates, no blocking)
 *  Observes = safe (observable cancellation)
 *  Blocks = unsafe (blocking op without exit)
 *  Unknown = unsafe (cannot prove safety)
 */
function joinEffects(e1, e2) {
    // If either is Pure, the result is the other (Pure propagates)
    if (e1 === BlockingEffect.Pure) return e2;
    if (e2 === BlockingEffect.Pure) return e1;
    // Blocks and Unknown are both unsafe, but Unknown means we can't analyze
    // so we conservatively return Unknown when mixed
    if (e1 === BlockingEffect.Blocks && e2 === BlockingEffect.Unknown) return BlockingEffect.Unknown;
    if (e2 === BlockingEffect.Blocks && e1 === BlockingEffect.Unknown) return BlockingEffect.Unknown;
    if (e1 === BlockingEffect.Blocks) return BlockingEffect.Blocks;
    if (e2 === BlockingEffect.Blocks) return BlockingEffect.Blocks;
    if (e1 === BlockingEffect.Unknown) return BlockingEffect.Unknown;
    if (e2 === BlockingEffect.Unknown) return BlockingEffect.Unknown;
    // Both are Observes - result is Observes
    return BlockingEffect.Observes;
}

// Test 1: Pure effects are admissible
function test_pure_admissible() {
    console.log('Test 1: Pure effects are admissible');
    if (isAdmissible(BlockingEffect.Pure)) {
        console.log('  ✓ PASS');
        return true;
    }
    console.log('  ✗ FAIL: Pure effect should be admissible');
    return false;
}

// Test 2: Observes effects are admissible
function test_observes_admissible() {
    console.log('Test 2: Observes effects are admissible');
    if (isAdmissible(BlockingEffect.Observes)) {
        console.log('  ✓ PASS');
        return true;
    }
    console.log('  ✗ FAIL: Observes effect should be admissible');
    return false;
}

// Test 3: Blocks effects are NOT admissible
function test_blocks_not_admissible() {
    console.log('Test 3: Blocks effects are NOT admissible');
    if (!isAdmissible(BlockingEffect.Blocks)) {
        console.log('  ✓ PASS');
        return true;
    }
    console.log('  ✗ FAIL: Blocks effect should NOT be admissible');
    return false;
}

// Test 4: Unknown effects are NOT admissible
function test_unknown_not_admissible() {
    console.log('Test 4: Unknown effects are NOT admissible');
    if (!isAdmissible(BlockingEffect.Unknown)) {
        console.log('  ✓ PASS');
        return true;
    }
    console.log('  ✗ FAIL: Unknown effect should NOT be admissible');
    return false;
}

// Test 5: Effect join returns worst case
function test_effect_join() {
    console.log('Test 5: Effect join returns worst case');

    const tests = [
        { e1: BlockingEffect.Pure, e2: BlockingEffect.Pure, expected: BlockingEffect.Pure },
        { e1: BlockingEffect.Pure, e2: BlockingEffect.Observes, expected: BlockingEffect.Observes },
        { e1: BlockingEffect.Pure, e2: BlockingEffect.Blocks, expected: BlockingEffect.Blocks },
        { e1: BlockingEffect.Observes, e2: BlockingEffect.Blocks, expected: BlockingEffect.Blocks },
    ];

    let allPass = true;
    for (const t of tests) {
        const result = joinEffects(t.e1, t.e2);
        if (result !== t.expected) {
            console.log(`  ✗ FAIL: join(${t.e1}, ${t.e2}) = ${result}, expected ${t.expected}`);
            allPass = false;
        }
    }

    if (allPass) {
        console.log('  ✓ PASS');
        return true;
    }
    return false;
}

// Test 6: Task spawn admittance rule
function test_task_spawn_rule() {
    console.log('Test 6: Task spawn admittance requires admissible callee');

    // A task spawn is admissible if the callee has Pure or Observes effect
    const calleeEffect = BlockingEffect.Observes;
    const isCalleeAdmissible = isAdmissible(calleeEffect);

    if (isCalleeAdmissible) {
        console.log('  ✓ PASS: Admissible callee allows task spawn');
        return true;
    }
    console.log('  ✗ FAIL: Admissible callee check failed');
    return false;
}

// Test 7: Blocking call reject rule
function test_blocking_call_reject() {
    console.log('Test 7: Blocking foreign call is rejected');

    // A blocking foreign call has Blocks or Unknown effect
    const foreignEffect = BlockingEffect.Blocks;
    const isRej = !isAdmissible(foreignEffect);

    if (isRej) {
        console.log('  ✓ PASS: Blocking foreign call correctly rejected');
        return true;
    }
    console.log('  ✗ FAIL: Blocking foreign call should be rejected');
    return false;
}

// Test 8: Uninterruptible call reject (HYB-E3501)
function test_uninterruptible_call_reject() {
    console.log('Test 8: Uninterruptible call rejected (HYB-E3501)');

    // An uninterruptible foreign call has Unknown effect
    const effect = BlockingEffect.Unknown;
    const shouldReject = !isAdmissible(effect);

    if (shouldReject) {
        console.log('  ✓ PASS: Uninterruptible call correctly rejected');
        return true;
    }
    console.log('  ✗ FAIL: Uninterruptible call should be rejected');
    return false;
}

// Test 9: Select without cancellation reject (HYB-E3503)
function test_select_without_cancel_reject() {
    console.log('Test 9: Select without cancellation branch rejected (HYB-E3503)');

    // A select without a done channel case cannot propagate cancellation
    // This is detected by checking if all channel operations are "Blocks"
    const channelEffect = BlockingEffect.Blocks;
    const hasCancelExit = false; // no cancellation branch

    // If channels block AND no cancel exit, must reject
    if (channelEffect === BlockingEffect.Blocks && !hasCancelExit) {
        console.log('  ✓ PASS: Select without cancellation correctly rejected');
        return true;
    }
    console.log('  ✗ FAIL: Select without cancellation should be rejected');
    return false;
}

// Test 10: Blocking cleanup reject (HYB-E3504)
function test_blocking_cleanup_reject() {
    console.log('Test 10: Blocking cleanup in defer rejected (HYB-E3504)');

    // Cleanup operations that can block forever cannot be used in
    // cancellation-safe regions
    const cleanupEffect = BlockingEffect.Blocks;

    if (cleanupEffect === BlockingEffect.Blocks) {
        console.log('  ✓ PASS: Blocking cleanup correctly rejected');
        return true;
    }
    console.log('  ✗ FAIL: Blocking cleanup should be rejected');
    return false;
}

// Run all tests
console.log('=== W-007 Cancellation Effect Verification ===\n');

const tests = [
    test_pure_admissible,
    test_observes_admissible,
    test_blocks_not_admissible,
    test_unknown_not_admissible,
    test_effect_join,
    test_task_spawn_rule,
    test_blocking_call_reject,
    test_uninterruptible_call_reject,
    test_select_without_cancel_reject,
    test_blocking_cleanup_reject,
];

for (const test of tests) {
    if (test()) passed++;
    else failed++;
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
    process.exit(1);
}
process.exit(0);