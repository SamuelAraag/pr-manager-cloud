import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #values = new Map();

    getItem(key) { return this.#values.get(key) ?? null; }
    setItem(key, value) { this.#values.set(key, String(value)); }
    removeItem(key) { this.#values.delete(key); }
    clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
const LocalStorage = await import('../src/localStorageService.js');
const AuthService = await import('../src/authService.js');

test.beforeEach(() => {
    localStorage.clear();
    LocalStorage.setItem('token', 'token-de-teste');
});

test('restoreSession substitui tenant inválido quando existe apenas um vínculo', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000035';
    LocalStorage.setItem('currentTenantId', 'tenant-removido');
    const responses = [
        { id: 7, name: 'Dev', currentTenantId: null, tenants: [{ tenantId, tenantName: 'Tenant', role: 'Member' }] },
        { id: 7, name: 'Dev', currentTenantId: tenantId, tenants: [{ tenantId, tenantName: 'Tenant', role: 'Member' }] }
    ];
    globalThis.fetch = async () => new Response(JSON.stringify(responses.shift()), { status: 200 });

    const session = await AuthService.restoreSession();

    assert.equal(session.state, 'ready');
    assert.equal(LocalStorage.getItem('currentTenantId'), tenantId);
    assert.equal(LocalStorage.getItem('appUser'), 'Dev');
    assert.equal(LocalStorage.getItem('appUserId'), 7);
});

test('restoreSession solicita seleção quando o tenant salvo não pertence mais ao usuário', async () => {
    LocalStorage.setItem('currentTenantId', 'tenant-removido');
    globalThis.fetch = async () => new Response(JSON.stringify({
        id: 8,
        name: 'QA',
        currentTenantId: null,
        tenants: [
            { tenantId: 'tenant-a', tenantName: 'A', role: 'Member' },
            { tenantId: 'tenant-b', tenantName: 'B', role: 'Member' }
        ]
    }), { status: 200 });

    const session = await AuthService.restoreSession();

    assert.equal(session.state, 'tenant-selection-required');
    assert.equal(LocalStorage.getItem('currentTenantId'), null);
});

test('restoreSession preserva o token quando Users/me falha temporariamente', async () => {
    globalThis.fetch = async () => new Response('Bad Gateway', {
        status: 502,
        statusText: 'Bad Gateway',
    });

    const session = await AuthService.restoreSession();

    assert.equal(session.state, 'unavailable');
    assert.equal(LocalStorage.getItem('token'), 'token-de-teste');
});
