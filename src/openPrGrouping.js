// Issue #70: a tabela "PRs em aberto" agrupa pelo destino do PR (uma linha de
// pr_destination_branches), não pelo projeto. A chave do grupo é o targetBranchId; a
// ordem vem do tipo — main, depois dev, depois os épicos por nome. Módulo isolado (sem
// dependências) para ser testável sem carregar o DOM.

const GROUP_ORDER = { Main: 0, Dev: 1, Epic: 2 };

/** Chave/rótulo/ordem do grupo de um PR na tabela "PRs em aberto". */
export function openPrGroupKey(pr) {
    const kind = pr.targetBranchKind || 'Main';
    const nome = (pr.targetBranchName || '').trim();
    const label = kind === 'Epic'
        ? (nome ? `épico · ${nome}` : 'épico (sem nome)')
        : (nome || (kind === 'Dev' ? 'dev' : 'main'));
    return {
        id: pr.targetBranchId || `kind:${kind}`,
        label,
        order: GROUP_ORDER[kind] ?? 2,
    };
}

/** Agrupa os PRs por destino e devolve os grupos já ordenados (main, dev, épicos por nome). */
export function groupOpenPrsByDestination(prs) {
    const grouped = prs.reduce((acc, pr) => {
        const g = openPrGroupKey(pr);
        (acc[g.id] || (acc[g.id] = { ...g, prs: [] })).prs.push(pr);
        return acc;
    }, {});
    return Object.values(grouped).sort(
        (a, b) => a.order - b.order || a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
    );
}
