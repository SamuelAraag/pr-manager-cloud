# Plano — Nova estratégia de gestão do PR Manager

> Objetivo: transformar o PR Manager em uma plataforma multi-app, com gestão completa
> de **usuários** (criar/remover, com papéis) e de **apps** (projetos com nome e link de
> repositório), onde todo o fluxo de PRs, batches de versão e ambientes (dev/stg/prod)
> vive **dentro de um app**.

---

## 1. Situação atual (resumo)

- O "projeto" é apenas um campo de texto no PR (`select` populado estaticamente). Não existe entidade Projeto/App no backend nem CRUD.
- Usuários são listados via `GET /Users`, mas não há tela de criação/remoção. A lista `validDevs` está **hardcoded** em `src/script.js`.
- Papéis atuais: `Admin`, `QA`, `Dev` (JWT), com permissões mapeadas em `src/constants/roles.js` e visibilidade declarativa via `data-roles` (`src/authService.js`).
- Ambientes: hoje só existe o conceito implícito de STG (release de batch para staging). Não há dev/prod nem rastreio de "o que está em qual ambiente".
- Backend: .NET Core + SQLite (repositório separado). Este plano define o contrato de API esperado; as mudanças de banco/endpoint acontecem lá.

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
- "Gestor do Projeto" assume as permissões que hoje estão no `Admin` de PR/batch; `Admin` global fica só com gestão da plataforma (usuários/apps) + herda tudo.
- Remoções são **soft delete** (flag `ativo`) para não quebrar histórico de PRs/batches.

## 3. Contrato de API (backend .NET)

### Usuários
- `GET /Users` — lista (já existe, passa a incluir papéis/memberships)
- `POST /Users` — criar `{ name, email, password, isAdmin }`
- `PUT /Users/{id}` — editar dados/papéis
- `DELETE /Users/{id}` — desativar (soft delete)

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

```sql
-- Usuários e papéis
users (
  id            uuid PK DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  avatar_url    text,
  is_admin      boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
)

apps (
  id             uuid PK,
  name           text NOT NULL UNIQUE,
  repository_url text NOT NULL,
  description    text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
)

app_members (
  app_id     uuid FK -> apps(id),
  user_id    uuid FK -> users(id),
  role       app_role NOT NULL,             -- enum: 'dev' | 'gestor' | 'qa'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, user_id)
)

-- Fluxo de PRs
pull_requests (
  id            uuid PK,
  app_id        uuid NOT NULL FK -> apps(id),
  author_id     uuid NOT NULL FK -> users(id),
  approver_id   uuid FK -> users(id),
  sprint_id     uuid FK -> sprints(id),
  batch_id      uuid FK -> version_batches(id),
  summary       text NOT NULL,
  pr_url        text NOT NULL,
  task_url      text,                        -- Jira
  teams_url     text,
  status        pr_status NOT NULL DEFAULT 'open',
                -- enum: open | approved | correction | fixed | archived
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)

pr_events (                                  -- trilha de auditoria (hoje inexistente)
  id         uuid PK,
  pr_id      uuid NOT NULL FK -> pull_requests(id),
  actor_id   uuid NOT NULL FK -> users(id),
  event_type text NOT NULL,                  -- approved, correction_requested, fixed, archived...
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)

-- Versões e sprints
version_batches (
  id            uuid PK,
  app_id        uuid NOT NULL FK -> apps(id),
  version       text,                        -- ex: 2.14.0 (null enquanto só solicitado)
  status        batch_status NOT NULL DEFAULT 'requested',
                -- enum: requested | versioned | in_staging | in_production | cancelled
  requested_by  uuid FK -> users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, version)
)

sprints (
  id           uuid PK,
  name         text NOT NULL,
  started_at   timestamptz NOT NULL,
  completed_at timestamptz
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
  batch_id       uuid NOT NULL FK -> version_batches(id),
  deployed_by    uuid NOT NULL FK -> users(id),
  deployed_at    timestamptz NOT NULL DEFAULT now(),
  status         deploy_status NOT NULL DEFAULT 'active'
                 -- enum: active | superseded | rolled_back
)
-- "versão atual do ambiente" = deployment ativo mais recente do environment

-- Módulos existentes que migram junto
monitor_status_apps (
  id         uuid PK,
  app_id     uuid FK -> apps(id),            -- vincula monitor ao app (Fase 5)
  name       text NOT NULL,
  check_url  text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
)

automation_configs (
  id      uuid PK,
  app_id  uuid FK -> apps(id),
  payload jsonb NOT NULL                     -- tokens/config GitLab hoje soltos
)
```

Índices principais: `pull_requests(app_id, status)`, `pull_requests(author_id)`, `deployments(environment_id, deployed_at DESC)`, `pr_events(pr_id)`, `app_members(user_id)`.

Convenções:
- `uuid` como PK em tudo (gerável no cliente, sem colisão entre ambientes, facilita import/export).
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
     - `Users` → `users` (gerar `email` provisório se não existir; senhas re-hash se o formato mudar).
     - Valores distintos de `project` nos PRs → `apps` (com `repository_url` preenchido manualmente depois; placeholder `""` na carga).
     - PRs → `pull_requests` com `app_id` resolvido pelo nome do projeto; status atual mapeado para o enum.
     - Batches → `version_batches`; batch em staging vira `deployment` ativo no environment `stg` do app.
     - Todo usuário Admin atual → `is_admin = true` + membership `gestor` em todos os apps migrados.
   - Registros órfãos (PR sem projeto reconhecível) vão para um app `"Legado"`.

3. **Validação e corte**
   - Rodar backend em paralelo apontando para o PostgreSQL num ambiente de teste; comparar contagens e amostras (PRs por status, batches por app).
   - Janela de corte curta: congelar escrita (o modal de manutenção que acabamos de remover pode voltar temporariamente aqui, agora com propósito), rodar o ETL final, apontar a API para o PostgreSQL, liberar.
   - Manter o arquivo SQLite como backup somente-leitura por ~30 dias.

4. **Pós-migração**
   - Backup diário automatizado (`pg_dump` + retenção de 7/30 dias).
   - Health check do banco no monitor de status.

## 6. Épicos entregáveis

Cada épico é fechado em si: termina com algo funcionando em produção, sem depender
dos épicos seguintes. A ordem abaixo é a ordem recomendada de execução.

---

### ÉPICO 1 — Novo banco de dados (PostgreSQL)
**Valor entregue:** aplicação atual rodando igual, mas sobre um banco consistente e com backup.

| # | História | Onde |
|---|---|---|
| 1.1 | Subir PostgreSQL via Docker Compose na VM, com volume e backup diário (`pg_dump`) | Infra |
| 1.2 | Trocar provider EF Core para Npgsql; connection string por variável de ambiente | Backend |
| 1.3 | Regenerar migrations com o esquema atual (sem mudanças de modelo ainda) | Backend |
| 1.4 | ETL SQLite → PostgreSQL + validação de contagens | Backend |
| 1.5 | Corte: janela curta de manutenção, ETL final, apontar API, liberar | Infra |

**Critério de aceite:** app em produção no PostgreSQL; SQLite guardado como backup somente-leitura.

---

### ÉPICO 2 — Gestão de usuários
**Valor entregue:** Admin cria e remove usuários pela interface; fim da lista `validDevs` hardcoded.

| # | História | Onde |
|---|---|---|
| 2.1 | Tabela `users` no novo formato (email, `is_admin`, `is_active`) + endpoints CRUD | Backend |
| 2.2 | Soft delete: usuário desativado não loga, mas histórico permanece | Backend |
| 2.3 | Tela "Usuários" (Admin): listar, criar, editar, desativar | Frontend |
| 2.4 | Remover `validDevs` do `script.js`; selects de dev populados pela API | Frontend |

**Critério de aceite:** criar um usuário novo pela tela e ele consegue logar; desativar e ele não loga mais.

---

### ÉPICO 3 — Gestão de apps
**Valor entregue:** apps (nome + link de repositório) criados/removidos pela interface; home vira grade de apps.

| # | História | Onde |
|---|---|---|
| 3.1 | Tabelas `apps` e `app_members` + endpoints CRUD e de membros | Backend |
| 3.2 | Migração: valores distintos de `project` dos PRs viram apps; órfãos → app "Legado" | Backend |
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
| 4.2 | Autorização por papel-no-app em todos os endpoints de PR/batch | Backend |
| 4.3 | Reescrever `roles.js`/`authService.js`: `canInApp(appId, permission)` e `data-roles` sensível ao app | Frontend |
| 4.4 | Migração de acesso: Admins atuais → Admin global + Gestor nos apps migrados | Backend |

**Critério de aceite:** o mesmo usuário vê ações de Gestor no app A e só ações de Dev no app B.

---

### ÉPICO 5 — PRs e versões dentro do app
**Valor entregue:** todo o fluxo atual (PRs, batches, sprints) passa a viver no painel do app.

| # | História | Onde |
|---|---|---|
| 5.1 | Endpoints escopados: `/Apps/{appId}/PullRequests`, `/Apps/{appId}/VersionBatches` | Backend |
| 5.2 | Painel do app com abas PRs / Versões (mover tabelas atuais) | Frontend |
| 5.3 | Formulário de PR sem campo "projeto" (herda do app aberto) | Frontend |
| 5.4 | Trilha de auditoria `pr_events` gravada nas ações de PR | Backend |

**Critério de aceite:** fluxo completo (criar PR → aprovar → solicitar versão → batch) funcionando dentro de um app, sem regressão.

---

### ÉPICO 6 — Ambientes (dev / stg / prod)
**Valor entregue:** cada app mostra o que está em cada ambiente e o histórico de deploys.

| # | História | Onde |
|---|---|---|
| 6.1 | Tabelas `environments` e `deployments` + endpoints de estado e deploy | Backend |
| 6.2 | Migrar "release to staging" atual para criar `deployment` em stg | Backend |
| 6.3 | Aba Ambientes: dev/stg/prod, versão atual, histórico | Frontend |
| 6.4 | Promoção stg → prod (Gestor/Admin) com confirmação | Frontend |

**Critério de aceite:** liberar um batch em stg e promovê-lo a prod pela interface, com histórico visível.

---

### ÉPICO 7 — Integrações e polimento
**Valor entregue:** módulos periféricos alinhados ao novo modelo.

| # | História | Onde |
|---|---|---|
| 7.1 | Monitor de status vinculado ao app (`monitor_status_apps.app_id`) | Ambos |
| 7.2 | Notificações SignalR escopadas por app | Ambos |
| 7.3 | Config de automação (GitLab) por app (`automation_configs`) | Ambos |
| 7.4 | Atualizar README e changelog | Docs |

**Critério de aceite:** monitor, notificações e automação funcionando por app; documentação atualizada.

---

### Dependências entre épicos

```
ÉPICO 1 (banco) ─→ ÉPICO 2 (usuários) ─→ ÉPICO 3 (apps) ─→ ÉPICO 4 (papéis) ─→ ÉPICO 5 (PRs no app) ─→ ÉPICO 6 (ambientes) ─→ ÉPICO 7
```

A cadeia é linear de propósito: cada épico entrega valor sozinho e o sistema continua
utilizável ao fim de cada um. Se precisar de resultado visível mais cedo, os épicos 2 e 3
podem correr em paralelo depois do 1 (tocam tabelas e telas diferentes).

## 7. Riscos e pontos de atenção

- **Compatibilidade**: PRs antigos sem app definido — resolvido pela migração do Épico 3; manter fallback "App Legado" para registros órfãos.
- **JWT maior**: muitos apps por usuário incham o token; se necessário, buscar memberships via `GET /Users/me` em vez de claims.
- **Permissões duplicadas** (frontend esconde, backend autoriza): toda regra nova precisa existir nos dois lados — o backend é a fonte de verdade.
- **Papel "Admin" atual**: usuários hoje Admin viram Admin global + Gestor de todos os apps migrados, para não perderem acesso.
