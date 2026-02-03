# PR Manager

Sistema centralizado de gerenciamento de Pull Requests para controle de fluxo de desenvolvimento, aprovação e deploy.

## Sobre o Projeto

O **PR Manager** é uma aplicação web que centraliza o controle de Pull Requests de múltiplos projetos, permitindo acompanhamento em tempo real do status de desenvolvimento, aprovação e deploy. Os dados são armazenados no GitHub usando a API do GitHub/GitLab, garantindo versionamento e sincronização entre a equipe.

## Perfis de Usuário

### Desenvolvedor (Dev)
- **Criar novos PRs** com informações completas (projeto, resumo, links)
- **Editar PRs** criados por si mesmo
- **Acompanhar status** dos próprios PRs em tempo real
- **Visualizar histórico** de sprints e versões
- Acesso aos links de PR, Task (Jira) e Teams

### QA (Quality Assurance)
- **Aprovar PRs** após revisão
- **Solicitar versão** para deploy em staging
- **Marcar PRs para correção** com justificativa
- **Acompanhar versões em teste** (STG)
- **Validar deploys** em ambiente de staging
- Acesso completo ao histórico de testes

### Administrador
- **Aprovar PRs** para liberação
- **Visualizar métricas** de produtividade da equipe
- **Acompanhar sprints** e entregas
- Visão consolidada de todos os projetos

## Funcionalidades Principais

- Gerenciamento completo de PRs (CRUD)
- Sincronização automática com GitHub/GitLab
- Sistema de perfis de usuário (Disney+ style)
- Dashboard com múltiplas visões:
  - PRs em Aberto
  - PRs Aprovados (agrupados por projeto)
  - Versões em Teste (STG)
  - Histórico de Sprints
- Links diretos para PR, Task (Jira) e Teams
- Atalhos de teclado para agilidade
- Interface moderna e responsiva
- Autenticação via Personal Access Token

## Como Usar

### 1. Seleção de Perfil

- Ao abrir a aplicação, selecione seu perfil de usuário
- Você pode trocar de usuário a qualquer momento clicando no avatar ou pressionando `U`

### 2. Gerenciando PRs

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

#### Aprovar PR (Administrador)
- Localize o PR na tabela de **PRs em Aberto**
- Clique no botão **Aprovar** (✓)
- O PR será movido para a seção **PRs Aprovados**

#### Solicitar Versão (QA)
- Na seção **PRs Aprovados**, clique em **Solicitar Versão**
- Preencha as informações de versionamento
- Aguarde o deploy em staging

### 3. Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `N` | Novo PR |
| `R` | Atualizar Tela e Dados |
| `U` | Mudar Usuário |
| `?` | Ver Atalhos |
| `Esc` | Fechar Modal |
| `⌘ + Enter` | Salvar Formulário |

## Tecnologias Utilizadas

- **HTML5** - Estrutura semântica
- **CSS3** - Estilização moderna com variáveis CSS
- **JavaScript (ES6+)** - Lógica da aplicação na parte do Frontend
- **Lucide Icons** - Ícones modernos e leves
- **.Net Core** - Lógica da aplicação na parte do Backend
- **SQL Lite** - Banco de dados

## Licença

Este projeto é de uso interno da equipe de desenvolvimento e de total autoria de Samuel Santos (Samuel Araag).
