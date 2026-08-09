import test from 'node:test';
import assert from 'node:assert/strict';
import { findDeveloperById, resolveDeveloperId } from '../src/developerSelection.js';

const users = [
    { id: 7, name: 'Admin' },
    { id: '12', name: 'Itallo Cerqueira' }
];

test('encontra o desenvolvedor pelo ID independentemente do tipo', () => {
    assert.equal(findDeveloperById(users, '7'), users[0]);
    assert.equal(findDeveloperById(users, 12), users[1]);
});

test('preserva a seleção pelo ID mesmo quando existe outro nome informado', () => {
    assert.equal(resolveDeveloperId(users, 12, 'Admin'), '12');
});

test('usa o nome como compatibilidade quando o payload não contém devId', () => {
    assert.equal(resolveDeveloperId(users, null, 'Itallo Cerqueira'), '12');
});

test('não seleciona usuário ausente da lista retornada pela API', () => {
    assert.equal(resolveDeveloperId(users, 99, 'Usuário removido'), '');
    assert.equal(findDeveloperById(users, ''), null);
});
