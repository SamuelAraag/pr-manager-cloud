// Componente de período (data início/fim) reutilizável — issue pr-manager-cloud#18.
// Markup estático (index.html) + esta função liga os elementos, mesmo padrão de
// domService.confirmDialog/alertDialog. Fonte de verdade é ISO (YYYY-MM-DD), guardada em
// dataset.iso dos inputs; exibição é sempre DD/MM/AAAA.

const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const pad2 = (n) => String(n).padStart(2, '0');

const toISO = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

function fromISO(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
}

const formatDisplay = (date) => date ? `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}` : '';

function parseDisplay(str) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((str || '').trim());
    if (!match) return null;
    const [, d, m, y] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    // new Date() "conserta" datas inválidas (ex.: 31/02 vira 03/03) em vez de rejeitar —
    // comparar de volta com o que foi digitado é o jeito de pegar isso.
    if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
        return null;
    }
    return date;
}

const stripTime = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Máscara DD/MM/AAAA: insere as barras sozinho enquanto o usuário digita só números,
// mantendo o cursor na posição certa (conta dígitos antes do cursor, não caracteres).
function applyDateMask(input) {
    input.addEventListener('input', () => {
        const digitsBeforeCursor = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length;

        const digits = input.value.replace(/\D/g, '').slice(0, 8);
        let formatted = digits;
        if (digits.length > 4) {
            formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
        } else if (digits.length > 2) {
            formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        }
        input.value = formatted;

        let digitsSeen = 0;
        let cursorPos = formatted.length;
        for (let i = 0; i < formatted.length; i++) {
            if (digitsSeen === digitsBeforeCursor) { cursorPos = i; break; }
            if (/\d/.test(formatted[i])) digitsSeen++;
        }
        input.setSelectionRange(cursorPos, cursorPos);
    });
}

export function initDateRangePicker({
    fieldEl, startInput, endInput, calendarBtn, popoverEl,
    prevBtn, nextBtn, monthLabelEl, daysGridEl,
    summaryStartEl, summaryEndEl, applyBtn, cancelBtn, errorEl, onChange
}) {
    let pendingStart = null;
    let pendingEnd = null;
    let viewYear = 0;
    let viewMonth = 0;

    const getAppliedStart = () => fromISO(startInput.dataset.iso || '');
    const getAppliedEnd = () => fromISO(endInput.dataset.iso || '');

    function clearError() {
        startInput.classList.remove('is-invalid');
        endInput.classList.remove('is-invalid');
        errorEl?.classList.remove('visible');
    }

    function showError(message) {
        startInput.classList.add('is-invalid');
        endInput.classList.add('is-invalid');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
        }
    }

    function notifyChange() {
        onChange?.(startInput.dataset.iso || null, endInput.dataset.iso || null);
    }

    function setApplied(startDate, endDate) {
        startInput.value = formatDisplay(startDate);
        startInput.dataset.iso = startDate ? toISO(startDate) : '';
        endInput.value = formatDisplay(endDate);
        endInput.dataset.iso = endDate ? toISO(endDate) : '';
        notifyChange();
    }

    function renderMonthLabel() {
        monthLabelEl.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    }

    function renderDays() {
        daysGridEl.innerHTML = '';
        const firstOfMonth = new Date(viewYear, viewMonth, 1);
        const gridStart = new Date(viewYear, viewMonth, 1 - firstOfMonth.getDay());
        const today = stripTime(new Date());

        for (let i = 0; i < 42; i++) {
            const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
            const inCurrentMonth = cellDate.getMonth() === viewMonth;

            const cell = document.createElement('div');
            cell.className = 'date-range-day';
            cell.textContent = String(cellDate.getDate());

            if (!inCurrentMonth) cell.classList.add('is-other-month');
            if (sameDay(cellDate, today)) cell.classList.add('is-today');
            if (pendingStart && pendingEnd && cellDate > pendingStart && cellDate < pendingEnd) cell.classList.add('in-range');
            if (pendingStart && sameDay(cellDate, pendingStart)) cell.classList.add('is-start');
            if (pendingEnd && sameDay(cellDate, pendingEnd)) cell.classList.add('is-end');

            if (inCurrentMonth) {
                cell.tabIndex = 0;
                cell.setAttribute('role', 'button');
                cell.setAttribute('aria-label', formatDisplay(cellDate));
                cell.addEventListener('click', () => handleDayClick(cellDate));
                cell.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleDayClick(cellDate);
                    }
                });
            }

            daysGridEl.appendChild(cell);
        }
    }

    function renderSummary() {
        summaryStartEl.textContent = pendingStart ? formatDisplay(pendingStart) : '—';
        summaryEndEl.textContent = pendingEnd ? formatDisplay(pendingEnd) : '—';
    }

    function renderCalendar() {
        renderMonthLabel();
        renderDays();
        renderSummary();
        if (window.lucide) window.lucide.createIcons();
    }

    function handleDayClick(date) {
        if (!pendingStart || pendingEnd) {
            pendingStart = date;
            pendingEnd = null;
        } else if (date < pendingStart) {
            pendingStart = date;
        } else {
            pendingEnd = date;
        }
        renderCalendar();
    }

    function handleOutsideClick(e) {
        if (!fieldEl.contains(e.target)) closePopover();
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') closePopover();
    }

    function openPopover() {
        pendingStart = getAppliedStart();
        pendingEnd = getAppliedEnd();
        const base = pendingStart || new Date();
        viewYear = base.getFullYear();
        viewMonth = base.getMonth();
        renderCalendar();
        popoverEl.classList.add('open');
        document.addEventListener('mousedown', handleOutsideClick, true);
        document.addEventListener('keydown', handleKeydown, true);
    }

    function closePopover() {
        popoverEl.classList.remove('open');
        document.removeEventListener('mousedown', handleOutsideClick, true);
        document.removeEventListener('keydown', handleKeydown, true);
    }

    calendarBtn.addEventListener('click', () => {
        popoverEl.classList.contains('open') ? closePopover() : openPopover();
    });

    prevBtn.addEventListener('click', () => {
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        renderCalendar();
    });

    applyBtn.addEventListener('click', () => {
        clearError();
        setApplied(pendingStart, pendingEnd);
        closePopover();
    });

    cancelBtn.addEventListener('click', closePopover);

    function handleManualInput(input, isStart) {
        const raw = input.value.trim();
        clearError();

        if (!raw) {
            input.dataset.iso = '';
            notifyChange();
            return;
        }

        const parsed = parseDisplay(raw);
        if (!parsed) {
            showError('Data inválida. Use o formato DD/MM/AAAA.');
            return;
        }

        const other = fromISO((isStart ? endInput : startInput).dataset.iso || '');
        if (isStart && other && parsed > other) {
            showError('Data início não pode ser depois da data fim.');
            return;
        }
        if (!isStart && other && parsed < other) {
            showError('Data fim não pode ser antes da data início.');
            return;
        }

        input.dataset.iso = toISO(parsed);
        notifyChange();
    }

    applyDateMask(startInput);
    applyDateMask(endInput);
    startInput.addEventListener('blur', () => handleManualInput(startInput, true));
    endInput.addEventListener('blur', () => handleManualInput(endInput, false));
    startInput.addEventListener('input', clearError);
    endInput.addEventListener('input', clearError);

    return {
        getRange() {
            return { start: startInput.dataset.iso || null, end: endInput.dataset.iso || null };
        },
        setRange(startISO, endISO) {
            setApplied(fromISO(startISO), fromISO(endISO));
        },
        reset() {
            clearError();
            closePopover();
            setApplied(null, null);
        }
    };
}
