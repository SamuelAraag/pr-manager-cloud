export const ChangelogData = [
    {
        version: "4.1.11",
        date: "2026-02-04",
        changes: [
            "Possibilita criação de PR com outras tarefas relacionadas",
            "Melhoria na visualização do Pull Request e visualização de tarefas relacionadas",
            "Amostragem do Id da tarefa do Jira no cadastro de Pull Request",
            "Amostragem do Id Das tarefas do Jira no Pull Request Principal e nas tarefas relacionadas",
            "Adicionado a lista de tarefas feitas dentro do template da solicitação de deploy"
        ]
    },
    {
        version: "3.0.10",
        date: "2026-02-03",
        changes: [
            "Implementação de página dedicada para o histórico de atualizações (Changelog)",
            "Refatoração da navegação para suporte a múltiplas visualizações",
            "Melhorias na organização modular das constantes do sistema"
        ]
    },
    {
        version: "3.0.9",
        date: "2026-02-02",
        changes: [
            "Implementação de sistema de autenticação segura",
            "Integração com BCrypt.Net para verificação de credenciais",
            "Geração e validação de tokens JWT para sessões de usuário"
        ]
    },
    {
        version: "2.0.8",
        date: "2026-01-28",
        changes: [
            "Implementação de grupos de Sprints para organização do histórico",
            "Melhorias na filtragem de dados por período de desenvolvimento"
        ]
    },
    {
        version: "2.0.7",
        date: "2026-01-25",
        changes: [
            "Inclusão do número da versão da aplicação no rodapé da página",
            "Otimizações de performance no carregamento inicial"
        ]
    },
    {
        version: "2.0.6",
        date: "2026-01-22",
        changes: [
            "Implementação do sistema de arquivamento de Pull Requests",
            "Nova interface para gerenciamento de itens arquivados"
        ]
    },
    {
        version: "2.0.5",
        date: "2026-01-20",
        changes: [
            "Adicionado botão para remoção de lotes (batches) de versões",
            "Confirmações de exclusão para evitar perda acidental de dados"
        ]
    },
    {
        version: "2.0.4",
        date: "2026-01-18",
        changes: [
            "Incluso efeito de carregamento suave (smooth loading) nas tabelas",
            "Melhorias visuais nas transições de estado da interface"
        ]
    },
    {
        version: "2.0.3",
        date: "2026-01-15",
        changes: [
            "Implementação de sistema de polling para atualização automática dos dados",
            "Sincronização em tempo real entre diferentes sessões de uso"
        ]
    },
    {
        version: "2.0.2",
        date: "2026-01-12",
        changes: [
            "Bugfix: Corrigida falha no carregamento de PRs aprovados após exclusão de grupos de versão",
            "Melhoria na estabilidade das tabelas dinâmicas"
        ]
    },
    {
        version: "2.0.1",
        date: "2026-01-10",
        changes: [
            "Destaque visual para o perfil administrador em ações pendentes",
            "Indicadores de status para desenvolvedores identificarem necessidade de ajustes nos PRs",
            "Refinamento das cores de alerta e sucesso"
        ]
    },
    {
        version: "2.0.0",
        date: "2026-01-05",
        changes: [
            "Migração completa de toda a lógica da aplicação para o Backend",
            "Desenvolvimento de API robusta em C# .NET",
            "Migração para repositório privado para proteção das regras de negócio"
        ]
    },
    {
        version: "1.0.0",
        date: "2025-12-20",
        changes: [
            "Lançamento inicial (MVP) do PR Manager",
            "Lógica centralizada no front-end (HTML, CSS e JavaScript puro)",
            "Estratégia de persistência baseada em arquivo JSON versionado via GitHub pessoal"
        ]
    }
];

export const CURRENT_VERSION = ChangelogData[0].version;
