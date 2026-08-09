# pr-manager-cloud — Guia para o agente

Frontend do PR Manager. Vanilla JS (ES modules) multi-página, servido estático, com Bootstrap
5.3.8 + SCSS próprio. **Não é uma SPA com framework de componentes.**

Antes de criar ou alterar qualquer tela, leia **`AGENTS.md`** na raiz deste repositório: stack,
tokens disponíveis (e os que não existem), catálogo de classes CSS e funções JS reutilizáveis,
estados obrigatórios, regras rígidas e o débito conhecido que **não** deve ser replicado.

Para decisões de layout, hierarquia e densidade, use o subagente **`ui-designer`**
(`.claude/agents/ui-designer.md`).

## Contexto entre repositórios

O backend fica em `pr-manager`, que também hospeda:

- `.agent/preferencias.md` §12 — convenções de projeto (fonte de verdade; prevalece em caso de
  conflito com o `AGENTS.md` daqui);
- `.agent/workflows/implementar-frontend.md` — o fluxo completo de implementação;
- `ux-agent-kit/docs/ux/` — a versão detalhada das regras de UX, por tema (layout, navegação,
  listagens, formulários, diálogos, estados, permissões, responsividade, acessibilidade,
  terminologia) e o template de UI Contract.

Este repositório é entregue de forma **independente** do backend: PR próprio, e no deploy cada
um roda a `main` do seu repositório. Uma task que toca os dois vira dois Pull Requests, cada um
citando o outro.

## Comandos

- `npm run build:styles` — compila o SCSS. Rodar antes de considerar uma mudança de estilo
  concluída.
