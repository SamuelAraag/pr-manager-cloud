# Regras de UX e implementação — pr-manager-cloud

Ponto de entrada para qualquer agente (Claude Code, Copilot, Cursor) que for criar ou alterar
telas neste repositório. Leia antes de escrever HTML, CSS ou JS.

Este repositório é o frontend do PR Manager. O backend vive em `pr-manager`, que também
hospeda a versão completa destas regras (`ux-agent-kit/`) e as convenções gerais de projeto
(`.agent/preferencias.md`). Este arquivo é a versão auto-suficiente, para quando a sessão está
aberta só aqui.

## Ordem de precedência

1. Convenções de projeto (`.agent/preferencias.md` §12 no `pr-manager`; o essencial está
   replicado abaixo).
2. Regras de UX — estados obrigatórios, formulários, tabelas, diálogos, permissões,
   acessibilidade.
3. Julgamento visual — hierarquia, densidade, ruído (subagente `ui-designer` em
   `.claude/agents/ui-designer.md`).

Conflito entre eles se sinaliza ao usuário; não se resolve sozinho.

## O stack

**Não é uma SPA com framework de componentes** — não há Angular, React nem Vue.

- Uma página HTML própria por tela (`usuarios.html`, `apps.html`, `tenants.html`,
  `ambientes.html`, `monitor-de-status.html`, `organizacoes.html`, `changelog.html`,
  `index.html`), cada uma carregando `src/<tela>.js` via `<script type="module">`.
- Estilo: Bootstrap 5.3.8 (`src/styles/bootstrap`) + SCSS próprio (`src/styles/core`,
  `src/styles/themes`) + `src/style.css` legado.
- **Tema claro e tema escuro** (`src/styles/themes/`). Nenhuma tela pode assumir fundo fixo.
- Não existe "componente". Reuso é por **classe CSS compartilhada** e **função JS
  reutilizável** — catálogo abaixo.

## Tokens: o que existe e o que não existe

**Cor existe — sempre `var(--token)`, nunca hex novo.** Definidos em `src/styles/themes/` a
partir do mapa `$theme-fallback` de `src/styles/core/_variables.scss`:

| Papel | Token |
|---|---|
| Fundo da página | `--bg-color` |
| Superfície de card/painel | `--card-bg`, `--glass-bg`, `--glass-border` |
| Borda | `--border-color` |
| Texto principal | `--text-primary` |
| Texto secundário / metadata | `--text-secondary` |
| Ação principal, links, seleção | `--accent-color`, `--accent-glow` |
| Positivo | `--success-color` |
| Atenção | `--warning-color` |
| Erro / destrutivo | `--danger-color` |

Há tokens de domínio já prontos — `--module-tag-dev-*`, `--module-tag-stg-*`,
`--module-tag-prod-*`, `--module-card-ok-*`, `--module-card-error-*`, `--module-skeleton-*`,
`--modal-*`, `--chart-*`. Procure por eles antes de inventar cor.

**Spacing, raio, sombra e tipografia NÃO existem como escala própria** (há ~565 `px`
hardcoded e nenhuma escala). Enquanto uma camada de tokens não for criada, a escala oficial é
a do Bootstrap 5.3.8: utilitários `m-*`/`p-*`, `var(--bs-border-radius*)`,
`var(--bs-box-shadow*)`, `var(--bs-body-font-*)`. **Não crie escala nova** para resolver uma
tela.

**Movimento existe como convenção, não como token.** Há 11 `@keyframes` em
`src/styles/_legacy.scss` e `core/_base.scss` — `fadeIn`, `fadeInUp`, `panelFadeIn`,
`modalScaleIn`, `slideInRight`, `slideOutRight`, `expandWidth`, `statusPulse`,
`moduleSkeletonShimmer`, `rotation`, `bellShake`. Reutilize em vez de inventar duração nova:

| Situação | Convenção |
|---|---|
| Micro-interação (hover, foco, transform) | `0.2s ease` |
| Transição de estado maior, `fadeIn` | `0.3s ease` |
| Entrada de elemento | `0.4s` |
| Modal abrindo | `modalScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)` |
| Toast entrando | `slideInRight 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)` |
| Skeleton | `moduleSkeletonShimmer 1.2s infinite` |
| Pulso de status ao vivo | `statusPulse 2s infinite` |
| Spinner | `rotation 1s linear infinite` |

Anime `transform`/`opacity` (não `width`/`height`/`top`), nada acima de ~0.4s em resposta a
ação do usuário, e sempre com guard de `prefers-reduced-motion`.

## Catálogo — reutilize antes de criar

Se criar algo novo e reutilizável, **registre aqui na mesma task**.

### Classes CSS

| Classe | Para quê | Referência |
|---|---|---|
| `.module-page-header` (+ `.logo-area`, `.module-title`, `.actions`) | topo de rota administrativa: título, alternar tema, voltar | `usuarios.html` |
| `.module-section-head` / `.module-toolbar` / `.module-toolbar-actions` | linha de seção com contador e ação principal da listagem | `usuarios.html` |
| `.pr-table` | listagem onde comparar colunas importa | `usuarios.html` + `renderUsersTable()` |
| `.data-card` | listagem onde reconhecimento visual importa mais que comparação | `createApprovedCard()` em `src/domService.js` |
| `.tag` / `.status-badge` | etiqueta neutra / status de registro — sempre com texto, nunca só cor | vários |
| `.modal-overlay` / `.modal-content` / `.modal-header` | modal de confirmação curta ou formulário de uma etapa | `#userModal` em `usuarios.html` |
| `.btn btn-primary` / `btn-outline` / `btn-danger` | ação principal / secundária / destrutiva (`btn-danger` vem do Bootstrap) | `src/styles/_legacy.scss` |
| `.is-invalid` + `.field-error` | erro de validação inline no campo | `src/styles/_legacy.scss` |

### Funções JS

Todas exportadas por `src/domService.js`, salvo indicação.

- `showToast(message, type = 'success', title = '', isRestored = false)` — feedback de
  resultado de chamada à API. `type`: `'success' | 'error' | 'warning' | 'info'`. Requer
  `<div id="toast-container"></div>` na página.
- `confirmDialog(message, title, { confirmLabel, danger })` → `Promise<boolean>` — confirmação
  de ação destrutiva. Já resolve foco preso, Esc, clique fora e retorno de foco.
- `alertDialog(message, title)` → `Promise<void>` — aviso bloqueante.
- `enableEscapeToCloseModals()` — chamar uma vez por página que só tenha modais dispensáveis.
- `showLoading(...)` — estado de carregamento de uma região.
- `initializeTheme('themeToggleBtn')` (`src/themeService.js`) — chamar no topo do módulo de
  toda página nova.
- `src/authService.js` — `isAdmin()`, `isQA()`, `isDeveloper()`, `hasRole()`, `hasAnyRole()`,
  `can()`, `applyRoleBasedVisibility()`; multi-tenant: `isPlatformAdmin()`, `isAdminGlobal()`,
  `getRoleInCurrentTenant()`, `getMyTenants()`, `getCurrentAppRole()`.
- `src/apiService.js` — **todas** as chamadas HTTP passam por aqui.

## Layout: as primitivas deste projeto

Bootstrap está carregado, **mas o grid dele (`row`/`col-*`) não é usado em lugar nenhum** — há
14 usos de `.container` e zero de `row`/`col`. Layout aqui é Flexbox e CSS Grid direto (78
`display: flex`, 10 `display: grid`). Não introduza `row`/`col-*`: seria um segundo sistema de
layout convivendo com o atual.

| Necessidade | Primitiva |
|---|---|
| Largura da página | `.container` — `max-width: 1400px; margin: 0 auto; padding: 2rem` |
| Barra horizontal (cabeçalho, toolbar, grupo de botões) | `display: flex` + `justify-content` + `gap` |
| Formulário | `.module-form` — grid `repeat(3, minmax(0, 1fr))`, `gap: 16px`, colapsa para 1 coluna no mobile |
| Ações do formulário | `.module-form-actions` — `grid-column: 1 / -1`, flex à direita |
| Campo que ocupa a linha toda | `grid-column: 1 / -1` dentro do `.module-form` |
| Grade de cards | `grid-template-columns: repeat(auto-fit, 320px)` |
| Colunas iguais | `repeat(N, minmax(0, 1fr))` — o `minmax(0, ...)` impede que conteúdo longo estoure a coluna |

Resolva layout, agrupamento, alinhamento, spacing, largura e densidade **antes** de borda,
sombra e fundo. Card não é solução automática de layout. Ordem no DOM = ordem visual.

## Estrutura de uma tela nova

1. `<tela>.html` na raiz + `src/<tela>.js`. Tela administrativa é **sempre rota própria,
   nunca modal dentro do `index.html`**.
2. Ordem no módulo JS: `initializeTheme('themeToggleBtn')` → guarda de acesso (token + role,
   redirect para `index.html`) → carregar via `apiService.js` → renderizar.
3. Incluir o markup `#confirmDialog` / `#alertDialog` (copiar de `usuarios.html`) se a tela
   tiver confirmação — sem ele as funções caem no nativo silenciosamente.
4. Referências de estrutura: `usuarios.html` + `src/usersAdmin.js`, `tenants.html` +
   `src/tenantsAdmin.js`. Leia "Débito conhecido" antes de copiar.

## Estados obrigatórios

Tela que só trata o caminho feliz não está pronta. Para qualquer tela que carrega dados:

- **Loading** — nunca tela em branco; a estrutura deve se manter estável entre loading e
  conteúdo, sem salto de layout.
- **Vazio** — nada cadastrado ainda: explicar o que deveria existir e oferecer a próxima ação.
- **Vazio por filtro** — diferente do anterior; oferecer "limpar filtros".
- **Erro recuperável** — com botão de tentar novamente.
- **Sem permissão** — mensagem explícita, não 404 genérico nem redirect silencioso.
- **Sucesso** — via `showToast()`.

Formulários, além disso: inicial, inválido, enviando (submit desabilitado com indicador),
erro do servidor (mantendo os dados preenchidos) e salvo.

Validação de campo é **inline** — borda `is-invalid` + texto em `.field-error` junto ao campo,
marcando **apenas** o campo culpado, limpo ao corrigir e ao reabrir o formulário. Revalidar no
submit (não só em `blur`). Toast é para resultado de API, nunca para erro de validação
client-side. A mesma regra existe no backend, que retorna `400` com
`{ error: "codigo_em_snake_case" }` — a validação inline é UX, não barreira.

## Regras rígidas

- **Nunca editar `src/style.css` à mão.** Ele é **gerado** por `npm run build:styles` a partir
  de `src/styles/styles.scss` (que importa Bootstrap, `core/`, `themes/` e `_legacy.scss`).
  Estilo se altera no SCSS e depois se compila. O CSS gerado é versionado, então a edição
  manual parece funcionar — até alguém rodar o build e ela sumir.
- Cor sempre por token; nunca hex novo em `style="..."` inline.
- Nunca escala nova de spacing/raio/sombra/tipografia — use a do Bootstrap.
- Nunca `alert()`/`confirm()` nativos — use `showToast()`, `confirmDialog()`, `alertDialog()`.
- Confirmação destrutiva **nomeia a entidade**: "Desativar o usuário Maria Silva?", nunca
  "Tem certeza?".
- Nunca interpolar dado de usuário ou da API direto em `innerHTML` — preferir `textContent`.
- Separador em texto de UI (título de página, `<title>`, cabeçalho de modal) é **hífen simples
  `-`**, nunca travessão `—`. Ex.: `Membros - YouTube`.
- Nunca hardcodar lista de usuários ou projetos — tudo vem da API.
- Nunca esconder a ação principal da tela em menu de três pontos.
- Acessibilidade: operável por teclado, foco visível, `label` associado a todo input, nada
  comunicado só por cor, WCAG 2.2 AA.
- Responsivo de 320px a desktop; testar 320 / 768 / 1280, nos dois temas.

## Débito conhecido (não replicar)

O código antecede estas regras. Encontrar um padrão no código **não é prova** de que ele é o
correto. Reconfira com `grep -rn "\balert(\|\bconfirm(" src/*.js` — a lista envelhece.

- **`alert()`/`confirm()` nativos ainda em uso** em `appsHome.js`, `environments.js`,
  `monitorStatus.js`, `organizationsAdmin.js` e `script.js` (parcialmente migrado). Já
  migrados e bons como referência: `usersAdmin.js`, `tenantsAdmin.js`, `dateRangePicker.js`.
  As ocorrências dentro do próprio `domService.js` são o *fallback* intencional de
  `confirmDialog`/`alertDialog` quando falta o markup na página — não são débito.
- **Markup do diálogo só existe em `index.html`, `usuarios.html` e `tenants.html`.** Sem ele,
  `confirmDialog()` cai no nativo sem erro visível.
- **`escapeHtml` existe em `domService.js` mas não está no `export {...}`** — hoje é
  impossível importá-lo de outro módulo. Se precisar, adicione ao export na mesma task; não
  duplique um escape local.
- **Cores hex hardcoded** (`#fff`, `#0d6efd`, `#dc3545`, `#198754`) espalhadas em `style`
  inline e no JS, apesar de existirem tokens. Não expandir.
- **Não existe função central de estado vazio** — cada tela escreve sua string inline. Se a
  demanda envolver isso, extraia `renderEmptyState(container, { title, description,
  actionLabel, onAction })` e registre no catálogo.
- **As animações próprias não respeitam `prefers-reduced-motion`.** As ocorrências desse media
  query em `src/style.css` vêm do Bootstrap compilado; nenhum dos 11 `@keyframes` do projeto
  tem o guard. Ao encostar em uma animação, cubra-a.
- **`transition: all` em 9 declarações do SCSS** — anima o que não se pretendia e custa
  performance. Em código novo, declare a propriedade.
- **Guarda de rota trata só o caminho feliz** — redireciona sem mostrar o estado "sem
  permissão" e sem tratar loading/erro do carregamento.

## Quando o React chegar (nota para o futuro, não para hoje)

> **Nada nesta seção vale para a implementação de hoje.** O projeto **não tem React** — é
> vanilla JS multi-página, e é assim que toda tela deve ser feita agora. Não crie camada de
> "componentes" em JS puro, não abstraia código para uma migração que ainda não existe, não
> escolha uma solução pior hoje porque ela "combina mais com React depois". Esta seção é um
> bilhete para quem for conduzir a migração, não instrução para quem está implementando uma
> task.

Há intenção de migrar o frontend para React em entregas futuras. Estas regras foram escritas
para que a migração invalide **o mínimo possível** delas — mas é preciso saber o que é o quê.

**Sobrevive intacto** (não depende de stack): princípios, hierarquia visual, densidade, o ciclo
completo de interação, motion (função, hierarquia, timing, easing, reduced motion), regras de
disposição, navegação, listagens, formulários, diálogos, estados obrigatórios, permissões,
responsividade, acessibilidade, terminologia, o UI Contract e os tokens de cor.

**Precisa ser reescrito na migração** (está amarrado ao stack atual): o catálogo
(`11-component-catalog.md`) — classes CSS e funções JS viram componentes; a seção "stack"; a
estrutura de tela (`<tela>.html` + `src/<tela>.js` vira rota do router + componente de página);
a guarda de acesso; as primitivas de layout (`.container`, `.module-form` viram componentes de
layout); e o débito conhecido, que muda de natureza.

Três cuidados para não perder o trabalho feito:

1. **Mantenha o formato das entradas do catálogo** — "usar quando / não usar quando / exemplo".
   Ele funciona igual para classe CSS e para componente React; só o conteúdo muda.
2. **Migração parcial é o pior cenário para a regra "reutilize antes de criar"**, porque passam
   a existir duas formas de fazer tudo. Enquanto conviverem os dois mundos, o catálogo precisa
   dizer explicitamente qual é o canônico para tela nova — e telas legadas não servem de
   referência para telas React, nem o contrário.
3. **A migração é o momento certo de criar a camada de tokens** de spacing, raio, sombra e
   tipografia que hoje não existe, e de promover o vocabulário de movimento a token de verdade.
   Adiar isso significa carregar os 565 `px` hardcoded para dentro dos componentes novos.

## Antes de considerar concluída

- [ ] Reutilizei classes/funções do catálogo (ou registrei a nova).
- [ ] Sem hex novo, sem escala nova.
- [ ] Loading, vazio, vazio-por-filtro, erro e sem-permissão implementados.
- [ ] Funciona nos dois temas.
- [ ] Navegação por teclado testada; foco visível.
- [ ] Hover, focus, active, disabled e loading definidos onde se aplicam.
- [ ] Animação nova reutiliza a convenção existente e respeita `prefers-reduced-motion`.
- [ ] 320px, 768px e 1280px conferidos.
- [ ] Erros explicam o que fazer a seguir; nada de detalhe técnico cru na tela.
- [ ] Ação principal visualmente evidente.
- [ ] Ação destrutiva com confirmação que nomeia a entidade.
- [ ] `npm run build:styles` passando.
