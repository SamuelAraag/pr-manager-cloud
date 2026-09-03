import test from 'node:test';
import assert from 'node:assert/strict';
import { openPrGroupKey, groupOpenPrsByDestination } from '../src/openPrGrouping.js';

test('openPrGroupKey: main é ordem 0, rótulo "main"', () => {
    const g = openPrGroupKey({ targetBranchKind: 'Main', targetBranchName: 'main', targetBranchId: 'b-main' });
    assert.equal(g.order, 0);
    assert.equal(g.label, 'main');
    assert.equal(g.id, 'b-main');
});

test('openPrGroupKey: dev é ordem 1', () => {
    assert.equal(openPrGroupKey({ targetBranchKind: 'Dev', targetBranchName: 'dev' }).order, 1);
});

test('openPrGroupKey: kind ausente cai em main', () => {
    const g = openPrGroupKey({ targetBranchId: 'x' });
    assert.equal(g.order, 0);
    assert.equal(g.label, 'main');
});

test('openPrGroupKey: épico usa o id como chave e "épico · nome" como rótulo', () => {
    const g = openPrGroupKey({ targetBranchKind: 'Epic', targetBranchName: 'login-v2', targetBranchId: 'b-1' });
    assert.equal(g.id, 'b-1');
    assert.equal(g.label, 'épico · login-v2');
    assert.equal(g.order, 2);
});

test('openPrGroupKey: épico sem nome tem rótulo de fallback', () => {
    assert.equal(openPrGroupKey({ targetBranchKind: 'Epic', targetBranchId: 'b-2' }).label, 'épico (sem nome)');
});

test('groupOpenPrsByDestination: dois épicos de mesmo nome e ids diferentes viram dois grupos', () => {
    const grupos = groupOpenPrsByDestination([
        { id: 1, targetBranchKind: 'Epic', targetBranchName: 'checkout', targetBranchId: 'app-a-checkout' },
        { id: 2, targetBranchKind: 'Epic', targetBranchName: 'checkout', targetBranchId: 'app-b-checkout' },
    ]);
    assert.equal(grupos.length, 2);
});

test('groupOpenPrsByDestination: cenário da issue — 6 PRs, 4 grupos na ordem main, dev, épicos', () => {
    const prs = [
        { id: 1, targetBranchKind: 'Main', targetBranchName: 'main', targetBranchId: 'm' },
        { id: 2, targetBranchKind: 'Main', targetBranchName: 'main', targetBranchId: 'm' },
        { id: 3, targetBranchKind: 'Dev', targetBranchName: 'dev', targetBranchId: 'd' },
        { id: 4, targetBranchKind: 'Epic', targetBranchName: 'epico-2', targetBranchId: 'e2' },
        { id: 5, targetBranchKind: 'Epic', targetBranchName: 'epico-10', targetBranchId: 'e10' },
        { id: 6, targetBranchKind: 'Epic', targetBranchName: 'epico-2', targetBranchId: 'e2' },
    ];
    const grupos = groupOpenPrsByDestination(prs);
    assert.deepEqual(grupos.map(g => g.label), ['main', 'dev', 'épico · epico-2', 'épico · epico-10']);
    assert.deepEqual(grupos.map(g => g.prs.length), [2, 1, 2, 1]);
});
