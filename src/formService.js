function findErrorElement(field) {
    if (!field) return null;
    const container = field.closest?.('.form-group, .module-field');
    return container?.querySelector?.('.field-error') || null;
}

export function setFieldError(field, message) {
    if (!field) return;
    const errorElement = findErrorElement(field);
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('visible');
    }
}

export function clearFieldError(field) {
    if (!field) return;
    const errorElement = findErrorElement(field);
    field.classList.remove('is-invalid');
    field.removeAttribute('aria-invalid');
    if (errorElement) errorElement.classList.remove('visible');
}

export function clearFormErrors(form) {
    form?.querySelectorAll('input, select, textarea').forEach(clearFieldError);
}

export function prepareForm(form) {
    if (!form || form.dataset.validationReady === 'true') return;
    form.dataset.validationReady = 'true';
    form.noValidate = true;
    form.addEventListener('input', event => clearFieldError(event.target));
    form.addEventListener('change', event => clearFieldError(event.target));
}

export function validateFields(rules) {
    let firstInvalidField = null;

    rules.forEach(({ field, validate, message }) => {
        if (!field) return;
        clearFieldError(field);
        if (!validate(field.value, field)) {
            setFieldError(field, message);
            firstInvalidField ||= field;
        }
    });

    firstInvalidField?.focus();
    return firstInvalidField === null;
}

export function isRequired(value) {
    return String(value ?? '').trim().length > 0;
}

export function isValidEmail(value) {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isOptionalUrl(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return true;
    try {
        const url = new URL(normalized);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function beginFormSubmission(form) {
    if (!form || form.dataset.submitting === 'true') return false;
    form.dataset.submitting = 'true';
    form.setAttribute('aria-busy', 'true');
    form.querySelectorAll('[type="submit"]').forEach(button => {
        button.disabled = true;
    });
    return true;
}

export function endFormSubmission(form) {
    if (!form) return;
    delete form.dataset.submitting;
    form.removeAttribute('aria-busy');
    form.querySelectorAll('[type="submit"]').forEach(button => {
        button.disabled = button.dataset.permanentDisabled === 'true';
    });
}

export function resetFormState(form) {
    clearFormErrors(form);
    endFormSubmission(form);
}

export function bindDismissButton(button, onDismiss) {
    if (!button || typeof onDismiss !== 'function') return;
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
    });
}
