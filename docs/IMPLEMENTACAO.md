# Entrega da primeira versão

## Etapas implementadas

1. React + TypeScript + Vite, autenticação e recuperação de senha, build e Render Blueprint.
2. Quadros, convite com link vinculado ao e-mail confirmado, participantes, papéis e transferência de propriedade.
3. Colunas com tipo semântico, cartões, movimentação por arrastar e por menu, ordenação por posição, arquivamento e restauração.
4. Responsáveis, prazos, etiquetas, comentários, histórico e sincronização via eventos do banco. Busca e filtros por texto, responsável, etiqueta e prazo. Leitores apenas consultam.
5. Efeito Dominó: dependências, bloqueios, detecção de ciclos, impacto imediato e recomendação determinística.
6. Testes das regras SQL em PostgreSQL embarcado (PGlite), testes do cálculo e testes de interface com respostas simuladas. CI valida testes e build.

## Regras do Efeito Dominó

- `card_id` depende de `depends_on_card_id`; ambos pertencem ao mesmo quadro.
- Todos os pré-requisitos devem estar concluídos para iniciar ou concluir um cartão.
- Conclusão é definida pelo tipo `done` da coluna, independentemente do nome dela.
- Proibidos autorreferência, duplicatas, ciclos, dependências com arquivados e pré-requisitos pendentes adicionados a tarefas já iniciadas/concluídas.
- Impacto imediato conta apenas dependentes ativos que ficariam realmente disponíveis agora. Uma cadeia transitiva não conta como desbloqueio imediato.
- Ordem de recomendação: maior impacto, prazo mais próximo (sem prazo por último), criação mais antiga, ID. Zero impacto não gera recomendação.
- Reabrir um pré-requisito exige primeiro reabrir os dependentes iniciados/concluídos, inclusive arquivados, do fim da cadeia para o início.
- Pré-requisito pendente não pode ser arquivado enquanto houver dependente ativo. Um pré-requisito concluído pode ser arquivado sem invalidar a conclusão.
- Restaurar exige antes restaurar pré-requisitos pendentes arquivados. Se bloqueado, o cartão volta para uma coluna `todo`.
- Uma conclusão não conclui dependentes automaticamente. Apenas permite sua execução.

## Banco e autorização

Migração: `supabase/migrations/202611260001_initial.sql`. Tabelas: profiles, boards, board_members, board_invitations, board_columns, cards, card_assignees, labels, card_labels, comments, card_dependencies e activity_events.

RLS controla leitura por participação. Escrita direta é revogada de `anon` e `authenticated`. `create_board`, `board_action` e `accept_invitation` são as únicas RPCs públicas de escrita. Elas verificam identidade e papéis no banco; não aceitam identidade de autor vinda do cliente.

Todas as alterações de um quadro bloqueiam a mesma linha de `boards` antes de ler o estado. Isso serializa as mutações e a validação de ciclos. Cartões exigem `version` nas alterações para detectar edições obsoletas. Comentários são inserções independentes. Eventos de auditoria são gravados na mesma transação, sem tokens ou textos de comentários no payload.

O navegador recebe a chave pública e a sessão do usuário. Não utiliza service role. Invites guardam apenas hash SHA-256; o token original só retorna na criação, tem sete dias de validade, só pode ser usado uma vez e exige o e-mail confirmado correspondente. Compartilhe o link por um canal privado.

## Sincronização

O cliente escuta eventos de atividade e participação do quadro com Supabase Realtime; cada evento provoca nova consulta sujeita a RLS. Também recarrega ao reconectar, ganhar foco e a cada 20 segundos para corrigir eventos perdidos e revogações. Campos de edição abertos são preservados: alterações de versão geram aviso e impedem sobrescrita silenciosa. O usuário escolhe carregar os valores atuais.

## Validação e limites

- Testes SQL executam a migração real com um pequeno substituto de Supabase Auth, em PGlite. Verificam privilégios, RLS e regras transacionais. Não equivalem a testar Supabase Auth/Realtime hospedados.
- Testes de navegador usam respostas simuladas; validam formulários, leitura do quadro, recomendação, permissões visuais, filtro e tela móvel.
- A concorrência entre conexões reais e os fluxos de confirmação de e-mail, recuperação, convite e Realtime em duas contas precisam ser homologados no projeto Supabase, conforme README.
- Convites geram link; o administrador envia o link manualmente ao e-mail informado. Envio automático exige provedor e função de servidor, fora desta entrega.
- Histórico exibe as 100 atividades mais recentes. Ainda não há paginação visual do histórico.
- Não há fila offline: salvar exige conexão. Uma falha é informada sem apagar o texto em edição.
- Não foram executados deploy nem migração em conta externa. A infraestrutura depende das configurações do proprietário.
- Testes, build e audit devem passar antes de integrar a branch. Não se utiliza IA externa nesta versão.

## Depois da primeira versão

Checklists, página Minhas tarefas, menções, notificações individuais, anexos, calendário, importação da lista antiga, recorrência, lembretes por e-mail, automações, relatórios e mapa completo de dependências.
