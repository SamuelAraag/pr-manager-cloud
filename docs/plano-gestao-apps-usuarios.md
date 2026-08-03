# Plano — Nova estratégia de gestão do PR Manager

> Objetivo: transformar o PR Manager em uma plataforma multi-app, com gestão completa
> de **usuários** (criar/remover, com papéis) e de **apps** (projetos com nome e link de
> repositório), onde todo o fluxo de PRs, batches de versão e ambientes (dev/stg/prod)
> vive **dentro de um app**.

---

## 1. Situação atual (resumo)

- O "projeto" é apenas um campo de texto no PR (`PullRequest.Project`, `select` populado estaticamente no frontend). Não existe entidade Projeto/App no backend nem CRUD.
- Usuários são listados via `GET /api/Users` (único endpoint — não há POST/PUT/DELETE). Não há tela de criação/remoção; a lista `validDevs` está **hardcoded** em `src/script.js`.
- Papéis: o enum `UserRole` do backend já tem **`Dev`, `QA`, `Gestor`, `Admin`** — mas `Gestor` não é usado: `Permissions/Roles.cs` só define constantes `ADMIN`, `QA`, `DEV` e nenhum `[Authorize]` referencia Gestor. No frontend, as permissões estão em `src/constants/roles.js` com visibilidade declarativa via `data-roles` (`src/authService.js`).
- **Login é por `Name`, não por email** (`AuthService.LoginAsync` compara `u.Name == loginDto.Name`). O campo `Email` existe em `User`, mas não é usado para autenticação nem tem constraint de unicidade.
- Existe um **admin-login por senha secreta** (`POST /api/Auth/admin-login`): valida contra `AutomationConfig.SecretPassword` e devolve o token do usuário hardcoded `"Samuel Santos"`. Precisa ser removido ou adaptado ao novo `is_admin` (ver decisões, seção 7).
- `User` guarda **tokens criptografados por usuário** (`GitHubTokenEncrypted`, `GitLabTokenEncrypted`) e `LastLoginAt`.
- Ambientes: hoje só existe o conceito implícito de STG. O deploy para staging é registrado **por PR** (`PullRequest.DeployToStaging` grava version/pipeline/rollback no próprio PR) e **por batch** (`release-to-staging/{batchId}`). Não há dev/prod nem rastreio de "o que está em qual ambiente".
- O monitor de status (`MonitorStatusApp`) **já tem** um enum próprio de ambiente (`MonitorStatusEnvironment`), campos de status corrente (`CurrentStatus`, `LastCheckedAt`, `CurrentOutageStartedAt`, `LastHttpStatus`) e uma tabela de histórico (`MonitorStatusAppHistory`).
- `AutomationConfig` é uma linha global com tokens de **GitHub, GitLab e Jira** (email + token) além da `SecretPassword` — não é só GitLab. Há serviços `GitHubService`, `GitLabService` e `JiraService` que a consomem.
- Backend: .NET Core + SQLite, **neste mesmo repositório** (`backend/`). Todas as rotas têm prefixo `api/` (`[Route("api/[controller]")]`). Este plano define o contrato de API esperado; as mudanças de banco/endpoint acontecem lá.

## 2. Novo modelo de domínio

```
App (projeto)
 ├─ id, nome, repositoryUrl, descrição, ativo
 ├─ Membros (AppMember: userId + papel no app)
 ├─ PullRequests (cada PR pertence a um app)
 ├─ VersionBatches (cada batch pertence a um app)
 └─ Environments (dev | stg | prod)
      └─ Deployments (qual versão/batch está em cada ambiente)

User
 ├─ id, nome, email, avatar, ativo
 ├─ isAdmin (papel global de administração da plataforma)
 └─ Memberships (papel por app: Dev | Gestor | QA)

Sprint (global — decisão: sprints cruzam apps; ver seção 7)
 └─ agrega PRs e batches de vários apps; o painel do app filtra por interseção
```

### Papéis

| Papel | Escopo | O que pode fazer |
|---|---|---|
| **Admin** (global) | Plataforma | CRUD de usuários e de apps; tudo dos demais papéis |
| **Gestor do Projeto** | Por app | Aprovar PR, solicitar correção, arquivar, gerenciar batches, deploy stg/prod, gerenciar membros do app |
| **QA** | Por app | Solicitar versão, liberar/validar em stg, marcar correção, concluir sprint |
| **Dev** | Por app | Criar/editar seus PRs, acompanhar status |

Decisões-chave:
- O papel é **por app** (um usuário pode ser Dev no app A e Gestor no app B). O JWT passa a carregar `memberships: [{ appId, role }]` além do flag global `isAdmin`.
- O valor `Gestor` **já existe** no enum `UserRole` do backend (só nunca foi ativado nas permissões). A migração precisa tratar usuários eventualmente já gravados com esse papel.
- "Gestor do Projeto" assume as permissões que hoje estão no `Admin` de PR/batch; `Admin` global fica só com gestão da plataforma (usuários/apps) + herda tudo.
- Remoções são **soft delete** (flag `ativo`) para não quebrar histórico de PRs/batches.

### Mapeamento de permissões por endpoint (atual → novo)

Base para o Épico 4.2 — o que cada ação exige hoje e o que passará a exigir:

| Endpoint (hoje) | Exige hoje | Passa a exigir |
|---|---|---|
| `POST /PullRequests`, `PUT /PullRequests/{id}` | autenticado | membro do app (Dev+) |
| `POST /PullRequests/{id}/approve` | Admin | Gestor do app |
| `POST /PullRequests/{id}/request-correction` | Admin | Gestor ou QA do app |
| `POST /PullRequests/{id}/deploy-staging` | Admin | Gestor do app |
| `POST /PullRequests/{id}/mark-fixed` | **autenticado (aberto)** | autor do PR ou Gestor do app |
| `POST /PullRequests/{id}/mark-done` | Admin | Gestor do app |
| `POST /PullRequests/{id}/archive`, `DELETE` | Admin | Gestor do app |
| `POST /VersionBatches/request-version` | autenticado | QA ou Gestor do app |
| `POST /VersionBatches/release-to-staging/{batchId}` | Admin ou QA | QA ou Gestor do app |
| `POST /VersionBatches/cancel-request*` | Admin ou QA | QA ou Gestor do app |
| `remove-version`, `remove-pr`, `DELETE /VersionBatches/{id}` | Admin | Gestor do app |
| `POST /Sprints`, `complete`, `add-batch` | Admin ou QA | QA ou Gestor (sprint é global — qualquer app) |
| `MonitorStatusApps`, `AutomationConfig` (CRUD) | Admin | Admin global |
| `POST /Auth/change-password` | Admin | Admin global |

## 3. Contrato de API (backend .NET)

Todas as rotas mantêm o prefixo `api/` já usado pelo backend (omitido abaixo por brevidade).

### Usuários
- `GET /Users` — lista (já existe, passa a incluir papéis/memberships)
- `POST /Users` — criar `{ name, email, password, isAdmin }`
- `PUT /Users/{id}` — editar dados/papéis
- `DELETE /Users/{id}` — desativar (soft delete)
- `POST /Auth/login` — **passa a autenticar por email** (hoje é por `name`; ver Épico 2.5)

### Apps
- `GET /Apps` — lista apps do usuário logado (Admin vê todos)
- `POST /Apps` — criar `{ name, repositoryUrl, description }`
- `PUT /Apps/{id}` / `DELETE /Apps/{id}` (soft delete)
- `POST /Apps/{id}/members` — adicionar membro `{ userId, role }`
- `PUT /Apps/{id}/members/{userId}` — trocar papel
- `DELETE /Apps/{id}/members/{userId}` — remover membro

### Recursos escopados por app
Endpoints existentes ganham o escopo do app:
- `GET /Apps/{appId}/PullRequests`, `POST /Apps/{appId}/PullRequests`, …
- `GET /Apps/{appId}/VersionBatches`, …
- `GET /Apps/{appId}/Environments` — estado de dev/stg/prod (versão atual, último deploy)
- `POST /Apps/{appId}/Environments/{env}/deploy` — registra deploy de um batch no ambiente

Sprints permanecem globais (`GET/POST /Sprints`), pois um sprint agrega batches de vários apps.

Migração de dados: script que cria um App para cada valor distinto do campo `project` dos PRs existentes e vincula PRs/batches a ele.

## 4. Frontend — nova estrutura de navegação

```
Login / seleção de perfil
 └─ Home: grade de Apps (cards com nome, repo, status dos ambientes)
     ├─ [Admin] botão "Novo App" / editar / desativar
     ├─ [Admin] tela "Usuários" (CRUD + papéis)
     └─ Clicar num app → Painel do App
          ├─ Aba PRs (tabelas atuais: abertos, aprovados, correção)
          ├─ Aba Versões (batches, solicitar versão, histórico)
          └─ Aba Ambientes (dev | stg | prod: versão atual, histórico de deploys, promover)
```

Mudanças por arquivo:
- `src/constants/roles.js` — novos papéis (`GESTOR`) e permissões reescritas em função de papel-no-app; helper `canInApp(appId, permission)`.
- `src/authService.js` — ler memberships do JWT; `applyRoleBasedVisibility` passa a considerar o app selecionado.
- `src/apiService.js` — novos módulos `usersApi`, `appsApi`; funções de PR/batch recebem `appId`.
- `src/script.js` — quebrar em módulos por tela (`homeApps.js`, `appDashboard.js`, `usersAdmin.js`); estado global ganha `currentApp`.
- `index.html` — nova home de apps; modais de CRUD de app e de usuário; painel do app com abas.
- Remover `validDevs` hardcoded e o `select` estático de projetos — tudo passa a vir da API.

## 5. Banco de dados — migração do SQLite para PostgreSQL

### 5.1 Escolha do banco

**Recomendação: PostgreSQL.** Motivos frente ao SQLite atual:

- Concorrência real de escrita (SQLite trava o arquivo inteiro — com SignalR + vários usuários simultâneos isso já é um gargalo latente).
- Integridade forte: FKs sempre ativas, constraints `CHECK`, tipos estritos (SQLite aceita string em coluna int), `UNIQUE` composto confiável.
- Suporte de primeira classe no EF Core (`Npgsql.EntityFrameworkCore.PostgreSQL`), migrations idênticas ao fluxo atual.
- Recursos úteis para o novo modelo: enums nativos, `jsonb` (payloads de automação/config), índices parciais, `timestamptz`.
- Roda bem na VM atual via Docker; alternativa gerenciada (Supabase/Neon/RDS) se quiser tirar o banco da VM.

Alternativa aceitável: **SQL Server Express** (alinha com o stack .NET, limite de 10 GB — suficiente aqui). PostgreSQL ganha por ser livre de limite e mais leve na VM.

### 5.2 Esquema proposto

Convenção de chaves (decisão, ver seção 7): **tabelas existentes mantêm PK `int` identity** — trocar para uuid exigiria reescrever models, DTOs, rotas e o frontend, e contradiz o Épico 1 ("sem mudanças de modelo"). **Tabelas novas** (apps, app_members, environments, deployments, pr_events) nascem com `uuid`.

```sql
-- Usuários e papéis
users (
  id                    int PK IDENTITY,       -- mantém int (tabela existente)
  name                  text NOT NULL,
  email                 text NOT NULL UNIQUE,  -- exige saneamento no ETL (ver 5.3)
  password_hash         text NOT NULL,
  avatar_url            text,
  is_admin              boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  github_token_enc      text,                  -- já existe hoje (User.GitHubTokenEncrypted)
  gitlab_token_enc      text,                  -- já existe hoje (User.GitLabTokenEncrypted)
  last_login_at         timestamptz,           -- já existe hoje
  created_at            timestamptz NOT NULL DEFAULT now()
)

apps (
  id             uuid PK DEFAULT gen_random_uuid(),
  name           text NOT NULL UNIQUE,
  repository_url text NOT NULL,
  description    text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
)

app_members (
  app_id     uuid FK -> apps(id),
  user_id    int  FK -> users(id),
  role       app_role NOT NULL,             -- enum: 'dev' | 'gestor' | 'qa'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, user_id)
)

-- Fluxo de PRs (tabela existente — mantém int e os campos atuais)
pull_requests (
  id                  int PK IDENTITY,
  external_id         text,                    -- ID original do frontend (existe hoje)
  app_id              uuid NOT NULL FK -> apps(id),   -- substitui o campo texto `project`
  author_id           int NOT NULL FK -> users(id),
  approver_id         int FK -> users(id),
  approved_at         timestamptz,
  sprint_id           int FK -> sprints(id),
  batch_id            int FK -> version_batches(id),
  summary             text NOT NULL,
  pr_url              text NOT NULL,
  task_url            text,                    -- Jira
  teams_url           text,
  links_related_tasks text,
  status              pr_status NOT NULL DEFAULT 'open',
                      -- enum: ver tabela de mapeamento abaixo
  correction_reason   text,
  no_testing_required boolean NOT NULL DEFAULT false,
  -- Campos de versão/deploy por PR (legado — novos deploys usam `deployments`):
  version             text,
  pipeline_link       text,
  rollback            text,
  gitlab_issue_link   text,
  deployed_to_stg     boolean NOT NULL DEFAULT false,
  deployed_to_stg_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
)
-- Flags booleanas atuais (Approved, NeedsCorrection, VersionRequested,
-- VersionGroupStatus, ReqVersion) são deriváveis de `status` + `pr_events`
-- e NÃO migram como colunas — o ETL as converte (ver 5.3).

pr_events (                                  -- trilha de auditoria (hoje inexistente)
  id         uuid PK,
  pr_id      int NOT NULL FK -> pull_requests(id),
  actor_id   int NOT NULL FK -> users(id),
  event_type text NOT NULL,                  -- approved, correction_requested, fixed, archived...
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)

-- Versões e sprints (tabelas existentes — mantêm int e campos atuais)
version_batches (
  id                int PK IDENTITY,
  batch_id          text NOT NULL UNIQUE,     -- identificador string usado nas rotas (existe hoje)
  app_id            uuid NOT NULL FK -> apps(id),   -- substitui o campo texto `project`
  sprint_id         int FK -> sprints(id),    -- vínculo existe hoje e permanece
  version           text,                     -- ex: 2.14.0 (null enquanto só solicitado)
  pipeline_link     text,
  rollback          text,
  gitlab_issue_link text,
  status            batch_status NOT NULL DEFAULT 'requested',
                    -- enum: ver tabela de mapeamento abaixo
  requested_by      int FK -> users(id),      -- substitui RequestedVersionDevId/Name denormalizado
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, version)
)

sprints (                                    -- GLOBAL: um sprint agrega batches de vários apps
  id           int PK IDENTITY,
  name         text NOT NULL,
  started_at   timestamptz,
  completed_at timestamptz,
  is_active    boolean NOT NULL DEFAULT true  -- existe hoje (Sprint.IsActive)
)

-- Ambientes e deploys
environments (
  id     uuid PK,
  app_id uuid NOT NULL FK -> apps(id),
  kind   env_kind NOT NULL,                  -- enum: 'dev' | 'stg' | 'prod'
  url    text,
  UNIQUE (app_id, kind)
)

deployments (
  id             uuid PK,
  environment_id uuid NOT NULL FK -> environments(id),
  batch_id       int NOT NULL FK -> version_batches(id),
  deployed_by    int NOT NULL FK -> users(id),
  deployed_at    timestamptz NOT NULL DEFAULT now(),
  status         deploy_status NOT NULL DEFAULT 'active'
                 -- enum: active | superseded | rolled_back
)
-- "versão atual do ambiente" = deployment ativo mais recente do environment

-- Módulos existentes que migram junto
monitor_status_apps (                        -- mantém TODOS os campos atuais
  id                       int PK IDENTITY,
  app_id                   uuid FK -> apps(id),     -- vincula monitor ao app (Fase 5)
  environment_id           uuid FK -> environments(id),  -- substitui o enum próprio MonitorStatusEnvironment
  name                     text NOT NULL,
  check_url                text NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  current_status           text,
  last_status_label        text,
  last_http_status         int,
  last_checked_at          timestamptz,
  current_outage_started_at timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
)

monitor_status_app_histories (               -- tabela existente, migra junto
  id             int PK IDENTITY,
  monitor_app_id int NOT NULL FK -> monitor_status_apps(id),
  ...            -- campos atuais de MonitorStatusAppHistory preservados
)

automation_configs (
  id      uuid PK,
  app_id  uuid FK -> apps(id),               -- null = config global (fallback)
  payload jsonb NOT NULL
  -- payload cobre TODO o AutomationConfig atual: tokens GitHub + GitLab,
  -- credenciais Jira (email + token). A SecretPassword do admin-login
  -- NÃO migra (o fluxo admin-login é removido — ver seção 7).
)
```

#### Mapeamento de enums (atual → novo)

`PRStatus` (backend tem 7 estados; o enum novo os preserva — não reduzir):

| Atual (`PRStatus`) | Novo (`pr_status`) | Observação |
|---|---|---|
| `Open = 1` | `open` | |
| `Approved = 2` | `approved` | |
| `NeedsCorrection = 3` | `correction` | `CorrectionReason` migra junto |
| `VersionRequested = 4` | `version_requested` | não existia no rascunho anterior |
| `DeployedToStaging = 5` | `in_staging` | gera `deployment` em stg no ETL |
| `Done = 6` | `done` | não existia no rascunho anterior |
| `Archived = 7` | `archived` | |

Não existe status `Fixed` no backend (o endpoint `mark-fixed` limpa a flag de correção); "fixed" vira um `event_type` em `pr_events`, não um status.

`BatchStatus`:

| Atual (`BatchStatus`) | Novo (`batch_status`) | Observação |
|---|---|---|
| `Pending = 1` | `requested` (sem versão) / `versioned` (com versão) | ETL decide pelo campo `Version` |
| `Released = 2` | `in_staging` | gera `deployment` ativo em stg |
| `Deployed = 3` | `in_production` | gera `deployment` em prod |
| `Archived = 4` | `archived` | novo enum ganha `archived` |
| — | `cancelled` | novo estado; hoje `cancel-request*` desfaz a solicitação sem status próprio — **verificar no código** o comportamento exato antes do ETL |

Índices principais: `pull_requests(app_id, status)`, `pull_requests(author_id)`, `deployments(environment_id, deployed_at DESC)`, `pr_events(pr_id)`, `app_members(user_id)`.

Convenções:
- PK `int` nas tabelas existentes, `uuid` nas novas (decisão registrada na seção 7).
- `timestamptz` sempre em UTC; formatação de fuso é responsabilidade do frontend.
- Soft delete via `is_active` apenas em `users` e `apps`; registros de fluxo (PRs, batches, deploys) nunca são apagados — mudam de status.
- Enums nativos do PostgreSQL mapeados no Npgsql (`MapEnum<T>()`), eliminando strings mágicas de status espalhadas.

### 5.3 Estratégia de migração SQLite → PostgreSQL

1. **Preparação (sem downtime)**
   - Subir PostgreSQL na VM via Docker Compose (volume persistente + backup agendado com `pg_dump`).
   - Trocar o provider no backend: `Microsoft.EntityFrameworkCore.Sqlite` → `Npgsql.EntityFrameworkCore.PostgreSQL`; connection string via variável de ambiente.
   - Regenerar as migrations do zero (migrations de SQLite não são portáveis) já com o novo esquema da seção 5.2.

2. **Script de carga (ETL único)**
   - Ler o SQLite atual e popular o novo esquema:
     - `Users` → `users`: **saneamento de email obrigatório** antes do `UNIQUE` (emails vazios/duplicados ganham provisório `nome@pendente.local` e são corrigidos manualmente); `GitHubTokenEncrypted`/`GitLabTokenEncrypted`/`LastLoginAt` migram como estão; senhas BCrypt migram sem re-hash (formato não muda).
     - Valores distintos de `Project` nos PRs e batches → `apps` (com `repository_url` preenchido manualmente depois; placeholder `""` na carga).
     - PRs → `pull_requests` com `app_id` resolvido pelo nome do projeto; `PRStatus` mapeado pela tabela da seção 5.2; flags atuais viram `pr_events` retroativos: `Approved/ApprovedById/ApprovedAt` → evento `approved`; `NeedsCorrection/CorrectionReason` → evento `correction_requested`; `DeployedToStg(At)` → evento `deployed_to_staging` (com version/pipeline/rollback no `detail`).
     - Batches → `version_batches` preservando `BatchId`, `PipelineLink`, `Rollback`, `GitlabIssueLink`, `SprintId`; `RequestedVersionDevId` → `requested_by`; batch `Released` vira `deployment` ativo no environment `stg` do app; batch `Deployed` vira `deployment` em `prod`.
     - **Deploy por PR (legado)**: PRs com `DeployedToStg` mas sem batch geram deployment em stg vinculado ao batch do PR quando houver; sem batch, ficam só como `pr_events` + campos legados preservados na linha do PR.
     - `MonitorStatusApp` + `MonitorStatusAppHistory` → migram íntegros; o enum `MonitorStatusEnvironment` é resolvido para `environment_id` depois que os environments dos apps existirem (Épico 6) — até lá, coluna temporária com o valor antigo.
     - `AutomationConfig` → `automation_configs` global (`app_id = null`) com payload contendo tokens GitHub/GitLab/Jira; `SecretPassword` é descartada junto com o fluxo admin-login.
     - Papéis: usuário `Admin` atual → `is_admin = true` + membership `gestor` em todos os apps migrados; usuários já gravados como `Gestor` no enum → membership `gestor` nos apps dos seus PRs; `QA` → membership `qa`; `Dev` → membership `dev` nos apps dos seus PRs.
   - Registros órfãos (PR sem projeto reconhecível) vão para um app `"Legado"`.

3. **Validação e corte**
   - Rodar backend em paralelo apontando para o PostgreSQL num ambiente de teste; comparar contagens e amostras (PRs por status, batches por app).
   - Janela de corte curta: congelar escrita (o modal de manutenção que acabamos de remover pode voltar temporariamente aqui, agora com propósito), rodar o ETL final, apontar a API para o PostgreSQL, liberar.
   - Manter o arquivo SQLite como backup somente-leitura por ~30 dias.

4. **Pós-migração**
   - Backup diário automatizado (`pg_dump` + retenção de 7/30 dias).
   - Health check do banco no monitor de status (o endpoint `HealthController` já existe — estender para checar o PostgreSQL).

## 6. Épicos entregáveis

Cada épico é fechado em si: termina com algo funcionando em produção, sem depender
dos épicos seguintes. A ordem abaixo é a ordem recomendada de execução.

---

### ÉPICO 1 — Novo banco de dados (PostgreSQL)
**Valor entregue:** aplicação atual rodando igual, mas sobre um banco consistente e com backup.

**Escopo fixado:** este épico NÃO muda modelo — PKs continuam `int`, campos continuam os mesmos. Só troca provider, regenera migrations e carrega os dados. O esquema da seção 5.2 entra por partes nos épicos seguintes.

| # | História | Onde |
|---|---|---|
| 1.1 | Subir PostgreSQL via Docker Compose na VM, com volume e backup diário (`pg_dump`) | Infra |
| 1.2 | Trocar provider EF Core para Npgsql; connection string por variável de ambiente | Backend |
| 1.3 | Regenerar migrations com o esquema atual (sem mudanças de modelo) | Backend |
| 1.4 | ETL SQLite → PostgreSQL + validação de contagens | Backend |
| 1.5 | Corte: janela curta de manutenção, ETL final, apontar API, liberar | Infra |

**Critério de aceite:** app em produção no PostgreSQL; SQLite guardado como backup somente-leitura.

---

### ÉPICO 2 — Gestão de usuários
**Valor entregue:** Admin cria e remove usuários pela interface; fim da lista `validDevs` hardcoded.

| # | História | Onde |
|---|---|---|
| 2.1 | Evoluir tabela `users` (email único saneado, `is_admin`, `is_active`, `avatar_url`) + endpoints CRUD (hoje só existe `GET`) | Backend |
| 2.2 | Soft delete: usuário desativado não loga, mas histórico permanece | Backend |
| 2.3 | Tela "Usuários" (Admin): listar, criar, editar, desativar | Frontend |
| 2.4 | Remover `validDevs` do `script.js`; selects de dev populados pela API | Frontend |
| 2.5 | Migrar login de `name` para `email` (backend + tela de login) | Ambos |
| 2.6 | Remover o fluxo `admin-login` por senha secreta (usuário hardcoded); admins usam login normal com `is_admin` | Ambos |

**Critério de aceite:** criar um usuário novo pela tela e ele consegue logar (por email); desativar e ele não loga mais; `admin-login` desligado sem perda de acesso.

---

### ÉPICO 3 — Gestão de apps
**Valor entregue:** apps (nome + link de repositório) criados/removidos pela interface; home vira grade de apps.

| # | História | Onde |
|---|---|---|
| 3.1 | Tabelas `apps` e `app_members` + endpoints CRUD e de membros | Backend |
| 3.2 | Migração: valores distintos de `Project` (PRs **e** batches) viram apps; órfãos → app "Legado" | Backend |
| 3.3 | Home com grade de cards de apps (nome, repo, contadores) | Frontend |
| 3.4 | Modais de criar/editar/desativar app (Admin) | Frontend |
| 3.5 | Tela de membros do app: adicionar/remover usuário e definir papel | Frontend |

**Critério de aceite:** criar um app pela tela, adicionar membros com papéis, e ele aparece na home.

---

### ÉPICO 4 — Papéis por app (Dev, Gestor, QA)
**Valor entregue:** permissões deixam de ser globais; cada usuário age conforme seu papel em cada app.

| # | História | Onde |
|---|---|---|
| 4.1 | JWT com `isAdmin` + memberships (ou `GET /Users/me` se o token inchar) | Backend |
| 4.2 | Autorização por papel-no-app em todos os endpoints de PR/batch, seguindo a tabela de mapeamento da seção 2 (handler/policy customizado — `[Authorize(Roles=...)]` global não resolve papel-por-app) | Backend |
| 4.3 | Ativar `GESTOR` em `Permissions/Roles.cs` (o enum `UserRole.Gestor` já existe); reescrever `roles.js`/`authService.js`: `canInApp(appId, permission)` e `data-roles` sensível ao app | Ambos |
| 4.4 | Migração de acesso: Admins atuais → Admin global + Gestor nos apps migrados; usuários já gravados como `Gestor` → membership `gestor` | Backend |
| 4.5 | Fechar buracos atuais: `mark-fixed` hoje é aberto a qualquer autenticado — passa a exigir autor ou Gestor | Backend |

**Critério de aceite:** o mesmo usuário vê ações de Gestor no app A e só ações de Dev no app B.

---

### ÉPICO 5 — PRs e versões dentro do app
**Valor entregue:** todo o fluxo atual (PRs, batches, sprints) passa a viver no painel do app.

| # | História | Onde |
|---|---|---|
| 5.1 | Endpoints escopados: `/Apps/{appId}/PullRequests`, `/Apps/{appId}/VersionBatches`; campo texto `Project` → FK `app_id` (PRs e batches) | Backend |
| 5.2 | Painel do app com abas PRs / Versões (mover tabelas atuais) | Frontend |
| 5.3 | Formulário de PR sem campo "projeto" (herda do app aberto) | Frontend |
| 5.4 | Trilha de auditoria `pr_events` gravada nas ações de PR + eventos retroativos gerados a partir das flags atuais (`Approved`, `NeedsCorrection`, `DeployedToStg`) | Backend |
| 5.5 | Sprints permanecem globais; aba do app filtra PRs/batches do sprint pela interseção com o app | Ambos |

**Critério de aceite:** fluxo completo (criar PR → aprovar → solicitar versão → batch) funcionando dentro de um app, sem regressão.

---

### ÉPICO 6 — Ambientes (dev / stg / prod)
**Valor entregue:** cada app mostra o que está em cada ambiente e o histórico de deploys.

| # | História | Onde |
|---|---|---|
| 6.1 | Tabelas `environments` e `deployments` + endpoints de estado e deploy | Backend |
| 6.2 | Migrar "release to staging" atual (por batch **e** o legado por PR) para criar `deployment` em stg; alinhar `BatchStatus` ao novo enum (tabela da seção 5.2) | Backend |
| 6.3 | Aba Ambientes: dev/stg/prod, versão atual, histórico | Frontend |
| 6.4 | Promoção stg → prod (Gestor/Admin) com confirmação | Frontend |
| 6.5 | Migrar `MonitorStatusEnvironment` do monitor para referenciar `environments` | Backend |

**Critério de aceite:** liberar um batch em stg e promovê-lo a prod pela interface, com histórico visível.

---

### ÉPICO 7 — Integrações e polimento
**Valor entregue:** módulos periféricos alinhados ao novo modelo.

| # | História | Onde |
|---|---|---|
| 7.1 | Monitor de status vinculado ao app (`monitor_status_apps.app_id`), preservando histórico (`MonitorStatusAppHistory`) e campos de status corrente | Ambos |
| 7.2 | Notificações SignalR escopadas por app (hoje o `NotificationHub` é global) | Ambos |
| 7.3 | Config de automação por app (`automation_configs`): tokens **GitHub + GitLab + Jira** (hoje linha global única consumida por `GitHubService`/`GitLabService`/`JiraService`); manter config global como fallback | Ambos |
| 7.4 | Decidir destino dos tokens por usuário (`users.github_token_enc`/`gitlab_token_enc`): manter, migrar para config por app, ou remover | Ambos |
| 7.5 | Atualizar README e changelog | Docs |

**Critério de aceite:** monitor, notificações e automação funcionando por app; documentação atualizada.

---

### Dependências entre épicos

```
ÉPICO 1 (banco) ─→ ÉPICO 2 (usuários) ─→ ÉPICO 3 (apps) ─→ ÉPICO 4 (papéis) ─→ ÉPICO 5 (PRs no app) ─→ ÉPICO 6 (ambientes) ─→ ÉPICO 7
```

A cadeia é linear de propósito: cada épico entrega valor sozinho e o sistema continua
utilizável ao fim de cada um. Se precisar de resultado visível mais cedo, os épicos 2 e 3
podem correr em paralelo depois do 1 (tocam tabelas e telas diferentes).

## 7. Decisões registradas, riscos e pontos de atenção

### Decisões registradas

- **PKs**: tabelas existentes mantêm `int` identity (evita reescrever models/DTOs/rotas/frontend e mantém o Épico 1 sem mudança de modelo); tabelas novas nascem com `uuid`.
- **Sprints são globais**: um sprint agrega batches de vários apps (comportamento atual). O painel do app filtra por interseção. Se um dia sprint virar por app, é evolução separada.
- **Deploy legado por PR**: os campos de deploy no PR (`version`, `pipeline_link`, `rollback`, `deployed_to_stg*`) são preservados como legado somente-leitura; novos deploys acontecem só via `deployments` por batch.
- **`admin-login` (senha secreta + usuário hardcoded) será removido** no Épico 2.6; admins passam a usar login normal com `is_admin`. A `SecretPassword` não migra.
- **Status `Fixed` não existe** no backend e não será criado: "fixed" é evento (`pr_events`), não status.

### Riscos e pontos de atenção

- **Saneamento de email**: o `UNIQUE(email)` só entra depois de resolver emails vazios/duplicados no ETL (Épico 2.1); login por email (2.5) depende disso.
- **Compatibilidade**: PRs antigos sem app definido — resolvido pela migração do Épico 3; manter fallback "App Legado" para registros órfãos.
- **JWT maior**: muitos apps por usuário incham o token; se necessário, buscar memberships via `GET /Users/me` em vez de claims.
- **Permissões duplicadas** (frontend esconde, backend autoriza): toda regra nova precisa existir nos dois lados — o backend é a fonte de verdade. A tabela de mapeamento por endpoint (seção 2) é o contrato.
- **Papel "Admin" atual**: usuários hoje Admin viram Admin global + Gestor de todos os apps migrados, para não perderem acesso. Usuários já gravados como `Gestor` no enum (valor existe desde já) entram na migração do Épico 4.4.
- **`cancel-request` de batch**: verificar no código o comportamento atual (deleta? volta PRs para pending?) antes de mapear para o novo estado `cancelled`.
- **Autorização por app não é `[Authorize(Roles=...)]`**: o modelo atual de roles no JWT é global; papel-por-app exige policy/handler customizado lendo memberships — é o grosso do Épico 4.2.
