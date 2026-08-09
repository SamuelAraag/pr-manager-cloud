import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantOperationGuard } from '../src/tenantOperationGuard.js';

test('troca de tenant invalida operações iniciadas no tenant anterior', () => {
    const guard = createTenantOperationGuard();
    const previousRevision = guard.snapshot();

    const transitionRevision = guard.beginTransition();

    assert.equal(guard.isCurrent(previousRevision), false);
    assert.equal(guard.isCurrent(transitionRevision), true);
    assert.equal(guard.isTransitioning(), true);
});

test('uma transição antiga não encerra a troca mais recente', () => {
    const guard = createTenantOperationGuard();
    const firstRevision = guard.beginTransition();
    const secondRevision = guard.beginTransition();

    guard.endTransition(firstRevision);
    assert.equal(guard.isTransitioning(), true);

    guard.endTransition(secondRevision);
    assert.equal(guard.isTransitioning(), false);
});
