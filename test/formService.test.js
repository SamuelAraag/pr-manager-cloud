import test from 'node:test';
import assert from 'node:assert/strict';
import {
    beginFormSubmission,
    bindDismissButton,
    endFormSubmission,
    isOptionalUrl,
    isRequired,
    isValidEmail,
    validateFields
} from '../src/formService.js';

function createField(value = '') {
    const classes = new Set();
    const errorClasses = new Set();
    const errorElement = {
        textContent: '',
        classList: {
            add: value => errorClasses.add(value),
            remove: value => errorClasses.delete(value)
        }
    };
    return {
        value,
        focused: false,
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value)
        },
        setAttribute() {},
        removeAttribute() {},
        closest: () => ({ querySelector: () => errorElement }),
        focus() { this.focused = true; },
        errorElement,
        errorClasses
    };
}

test('validadores cobrem campos obrigatórios, email e URL', () => {
    assert.equal(isRequired('  valor  '), true);
    assert.equal(isRequired('   '), false);
    assert.equal(isValidEmail('dev@tenant.com'), true);
    assert.equal(isValidEmail('email-invalido'), false);
    assert.equal(isOptionalUrl(''), true);
    assert.equal(isOptionalUrl('https://jira.local/TASK-35'), true);
    assert.equal(isOptionalUrl('javascript:alert(1)'), false);
});

test('validateFields marca o campo inválido com mensagem inline', () => {
    const field = createField('');

    const valid = validateFields([
        { field, validate: isRequired, message: 'Campo obrigatório.' }
    ]);

    assert.equal(valid, false);
    assert.equal(field.classList.contains('is-invalid'), true);
    assert.equal(field.errorElement.textContent, 'Campo obrigatório.');
    assert.equal(field.errorClasses.has('visible'), true);
    assert.equal(field.focused, true);
});

test('beginFormSubmission impede segundo envio e restaura o botão ao finalizar', () => {
    const button = { disabled: false, dataset: {} };
    const attributes = new Map();
    const form = {
        dataset: {},
        setAttribute: (key, value) => attributes.set(key, value),
        removeAttribute: key => attributes.delete(key),
        querySelectorAll: () => [button]
    };

    assert.equal(beginFormSubmission(form), true);
    assert.equal(beginFormSubmission(form), false);
    assert.equal(button.disabled, true);

    endFormSubmission(form);

    assert.equal(button.disabled, false);
    assert.equal(attributes.has('aria-busy'), false);

    button.dataset.permanentDisabled = 'true';
    assert.equal(beginFormSubmission(form), true);
    endFormSubmission(form);
    assert.equal(button.disabled, true);
});

test('bindDismissButton cancela o evento e executa o fechamento', () => {
    let listener;
    let dismissed = false;
    const button = { addEventListener: (_event, callback) => { listener = callback; } };
    const event = {
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; }
    };

    bindDismissButton(button, () => { dismissed = true; });
    listener(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.equal(dismissed, true);
});
