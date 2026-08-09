import test from 'node:test';
import assert from 'node:assert/strict';
import { createPR, parseResponseBody, updatePR } from '../src/apiService.js';

globalThis.localStorage = {
    getItem: () => null
};

test('parseResponseBody retorna null para HTTP 204', async () => {
    const response = new Response(null, { status: 204 });

    assert.equal(await parseResponseBody(response), null);
});

test('parseResponseBody retorna null para resposta 200 vazia', async () => {
    const response = new Response('', { status: 200 });

    assert.equal(await parseResponseBody(response), null);
});

test('parseResponseBody preserva resposta JSON', async () => {
    const response = new Response(JSON.stringify({ id: 35, name: 'PR' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });

    assert.deepEqual(await parseResponseBody(response), { id: 35, name: 'PR' });
});

test('createPR aceita resposta 204 sem tentar interpretar JSON', async () => {
    globalThis.fetch = async (_url, options) => {
        assert.equal(options.method, 'POST');
        return new Response(null, { status: 204 });
    };

    assert.equal(await createPR({ summary: 'Novo PR' }), null);
});

test('updatePR aceita resposta 200 vazia e deixa a recarga para a tela', async () => {
    globalThis.fetch = async (_url, options) => {
        assert.equal(options.method, 'PUT');
        return new Response('', { status: 200 });
    };

    assert.equal(await updatePR(35, { summary: 'PR atualizado' }), null);
});
