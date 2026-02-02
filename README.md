# PR Manager

Sistema centralizado de gerenciamento de Pull Requests para controle de fluxo de desenvolvimento, aprovação e deploy.

## 📋 Sobre o Projeto

O **PR Manager** é uma aplicação web que centraliza o controle de Pull Requests de múltiplos projetos, permitindo acompanhamento em tempo real do status de desenvolvimento, aprovação e deploy. Os dados são armazenados no GitHub usando a API do GitHub/GitLab, garantindo versionamento e sincronização entre a equipe.

## 👥 Perfis de Usuário

### 🧑‍💻 Desenvolvedor (Dev)
- **Criar novos PRs** com informações completas (projeto, resumo, links)
- **Editar PRs** criados por si mesmo
- **Acompanhar status** dos próprios PRs em tempo real
- **Visualizar histórico** de sprints e versões
- Acesso aos links de PR, Task (Jira) e Teams

### 🧪 QA (Quality Assurance)
- **Aprovar PRs** após revisão
- **Solicitar versão** para deploy em staging
- **Marcar PRs para correção** com justificativa
- **Acompanhar versões em teste** (STG)
- **Validar deploys** em ambiente de staging
- Acesso completo ao histórico de testes

### 👔 Gestor
- **Aprovar PRs** para liberação
- **Visualizar métricas** de produtividade da equipe
- **Acompanhar sprints** e entregas
- Visão consolidada de todos os projetos

## ✨ Funcionalidades Principais

- ✅ Gerenciamento completo de PRs (CRUD)
- 🔄 Sincronização automática com GitHub/GitLab
- 👤 Sistema de perfis de usuário (Disney+ style)
- 📊 Dashboard com múltiplas visões:
  - PRs em Aberto
  - PRs Aprovados (agrupados por projeto)
  - Versões em Teste (STG)
  - Histórico de Sprints
- 🔗 Links diretos para PR, Task (Jira) e Teams
- ⌨️ Atalhos de teclado para agilidade
- 🎨 Interface moderna e responsiva
- 🔒 Autenticação via Personal Access Token

## 🚀 Como Usar

### 1. Configuração Inicial

1. Acesse a aplicação
2. Clique no botão de **Configurações** (ícone de engrenagem) ou pressione `S`
3. Insira seus tokens:
   - **GitHub Personal Access Token** (com permissões de `repo`)
   - **GitLab Personal Access Token** (com permissões de `api`)
4. Clique em **Salvar**

### 2. Seleção de Perfil

- Ao abrir a aplicação, selecione seu perfil de usuário
- Você pode trocar de usuário a qualquer momento clicando no avatar ou pressionando `U`

### 3. Gerenciando PRs

#### Criar novo PR
- Clique em **Novo PR** ou pressione `N`
- Preencha os campos:
  - Projeto
  - Desenvolvedor
  - Resumo
  - Link do PR
  - Link da Task (Jira)
  - Link do Post no Teams
- Salve com `⌘ + Enter` ou clique em **Salvar**

#### Aprovar PR (QA/Gestor)
- Localize o PR na tabela de **PRs em Aberto**
- Clique no botão **Aprovar** (✓)
- O PR será movido para a seção **PRs Aprovados**

#### Solicitar Versão (QA)
- Na seção **PRs Aprovados**, clique em **Solicitar Versão**
- Preencha as informações de versionamento
- Aguarde o deploy em staging

### 4. Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `N` | Novo PR |
| `S` | Configurações |
| `R` | Atualizar Dados |
| `U` | Mudar Usuário |
| `?` | Ver Atalhos |
| `Esc` | Fechar Modal |
| `⌘ + Enter` | Salvar Formulário |

## 🏗️ Estrutura do Projeto

```
pr-manager/
├── index.html          # Estrutura principal da aplicação
├── src/
│   ├── script.js       # Lógica principal e controle de estado
│   ├── style.css       # Estilos e tema dark
│   ├── effectService.js # Efeitos visuais e animações
│   └── assets/
│       └── profiles/   # Avatares dos usuários
└── README.md
```

## 📦 Modelagem do Objeto PR

```javascript
{
  // Identificação
  "id": "string",                    // ID único gerado automaticamente
  "project": "string",               // Nome do projeto (ex: "DF-e", "Classification")
  "dev": "string",                   // Nome do desenvolvedor
  "summary": "string",               // Resumo/descrição do PR
  
  // Links
  "prLink": "string",                // URL do Pull Request (BitBucket/GitLab)
  "taskLink": "string",              // URL da task no Jira
  "teamsLink": "string",             // URL da mensagem no Teams
  
  // Status e Aprovação
  "reqVersion": "string",            // Status da requisição de versão ("ok", "pending", etc)
  "approved": boolean,               // Se o PR foi aprovado
  "approvedBy": "string",            // Nome de quem aprovou
  "approvedAt": "string",            // Data/hora da aprovação (ISO 8601)
  
  // Correções
  "needsCorrection": boolean,        // Se precisa de correção
  "correctionReason": "string|null", // Motivo da correção solicitada
  
  // Versionamento
  "versionRequested": boolean,       // Se versão foi solicitada
  "versionBatchId": "string",        // ID do lote de versionamento
  "version": "string",               // Número da versão (ex: "26.01.30.428")
  "pipelineLink": "string",          // URL do pipeline de build
  "rollback": "string",              // Versão de rollback
  "versionGroupStatus": "string",    // Status do grupo de versão ("done", "pending", etc)
  
  // GitLab/Service Desk
  "gitlabIssueLink": "string",       // URL da issue no GitLab Service Desk
  
  // Deploy em Staging
  "deployedToStg": boolean,          // Se foi deployado em staging
  "deployedToStgAt": "string",       // Data/hora do deploy em staging (ISO 8601)
  
  // Sprint
  "sprint": "string",                // Sprint associada (ex: "Sprint 27")
  
  // Auditoria
  "updatedAt": "string"              // Última atualização (ISO 8601)
}
```

### Exemplo de Objeto Completo

```json
{
  "id": "1769771160000",
  "project": "DF-e",
  "dev": "Samuel Santos",
  "summary": "[T] NFSe recebidas",
  "prLink": "https://bitbucket.org/invent-software/taxplus.dfe/pull-requests/150",
  "taskLink": "https://invent-software.atlassian.net/browse/TXDF-774",
  "teamsLink": "https://teams.microsoft.com/l/message/...",
  "reqVersion": "ok",
  "approved": true,
  "updatedAt": "2026-01-30T11:06:00.000Z",
  "approvedBy": "Samuel Santos",
  "approvedAt": "2026-01-30T11:06:10.706Z",
  "versionRequested": false,
  "version": "26.01.30.428",
  "pipelineLink": "https://bitbucket.org/invent-software/taxplus.dfe/pipelines/results/428",
  "rollback": "26.01.29.34",
  "versionGroupStatus": "done",
  "gitlabIssueLink": "https://gitlab.com/invent-software/pmo/service-desk/-/issues/949",
  "deployedToStg": true,
  "deployedToStgAt": "2026-01-30T17:00:42.073Z",
  "sprint": "Sprint 27"
}
```

## 🔧 Tecnologias Utilizadas

- **HTML5** - Estrutura semântica
- **CSS3** - Estilização moderna com variáveis CSS
- **JavaScript (ES6+)** - Lógica da aplicação
- **GitHub API** - Armazenamento e sincronização de dados
- **GitLab API** - Integração com projetos GitLab
- **Lucide Icons** - Ícones modernos e leves

## 📝 Licença

Este projeto é de uso interno da equipe de desenvolvimento.
