# Minha Lista · Efeito Dominó

Quadro Kanban colaborativo em React + TypeScript, hospedado como Static Site no Render e integrado ao Supabase (Auth, PostgreSQL e Realtime).

O diferencial **Efeito Dominó** recomenda a tarefa disponível que libera mais tarefas imediatamente. Dependências são validadas no banco, com proteção contra ciclos, bloqueios e sobrescritas de edições antigas.

## Recursos da primeira versão

- Cadastro, login, logout, confirmação de e-mail e recuperação de senha.
- Quadros compartilhados, convites por link vinculados ao e-mail, permissões de administrador/editor/leitor e transferência de propriedade.
- Colunas personalizáveis com tipo A fazer / Em andamento / Concluído.
- Cartões com descrição, prazo, responsáveis, etiquetas, comentários e arquivamento.
- Movimentação por arrastar ou menu; ordenação por posição da coluna e topo/fim do cartão.
- Busca e filtros, histórico, atualização ao vivo e layout responsivo.
- Efeito Dominó com explicação dos bloqueios e do impacto imediato.

Veja [arquitetura, regras e limites da entrega](docs/IMPLEMENTACAO.md).

## 1. Criar o Supabase

1. Crie um **projeto novo e dedicado** em [Supabase](https://supabase.com/dashboard). Escolha uma região próxima da equipe e guarde a senha do banco em um local seguro.
2. No **SQL Editor**, abra uma consulta, cole todo o conteúdo de [`supabase/migrations/202611260001_initial.sql`](supabase/migrations/202611260001_initial.sql) e execute uma única vez. A migração é transacional e cria tabelas, funções, permissões e a publicação Realtime. Não execute sobre um projeto com outras aplicações: ela revoga escrita direta das tabelas públicas.
3. Em **Authentication → Providers → Email**, habilite login por e-mail e confirmação de e-mail. Configure senha mínima de pelo menos oito caracteres. A aceitação de convites exige e-mail confirmado.
4. Em **Project Settings / Connect / API Keys**, copie a **Project URL** e a **publishable key** (`sb_publishable_...`). A chave pública legada `anon` também é aceita pelo cliente. Nunca use `service_role`, `sb_secret_...` nem a senha do banco nas variáveis `VITE_`.
5. Confirme que RLS está habilitada nas 13 tabelas. A publicação `supabase_realtime` deve conter as tabelas definidas no final da migração.
6. Para uso por outras pessoas, configure **SMTP próprio** nas configurações de Auth. O envio padrão do Supabase tem restrições e não deve ser a base do fluxo de e-mails em produção. Teste cadastro e recuperação com endereços reais da equipe.

Alternativa com Supabase CLI: vincule o projeto novo e aplique `supabase db push`. Não combine essa alternativa com execução manual da mesma migração. Se executou pelo SQL Editor, registre a migração no histórico do CLI antes de adotar o CLI.

## 2. Rodar localmente

Requer Node.js 24 e npm.

```bash
npm ci
```

Copie `.env.example` para `.env.local` e preencha:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

```bash
npm run dev
```

Acesse `http://127.0.0.1:5173`. Em **Authentication → URL Configuration**, adicione `http://127.0.0.1:5173/` em Redirect URLs para testar confirmação e recuperação. Reinicie o servidor depois de mudar as variáveis.

Sem as variáveis, a aplicação mostra uma orientação de configuração. Não há modo de demonstração que finja salvar dados.

## 3. Publicar no Render

Depois de integrar a branch de implementação no GitHub:

1. No [Render](https://dashboard.render.com/), selecione **New → Static Site** e conecte `kaioPer/Lista_tarefas`.
2. Escolha a branch de entrega (`main`, depois do merge). **Root Directory:** deixe vazio.
3. **Build Command:** `npm ci && npm run build`.
4. **Publish Directory:** `dist`.
5. Adicione as duas variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, com os valores do seu Supabase.
6. Em **Redirects/Rewrites**, adicione Source `/*`, Destination `/index.html`, Action **Rewrite**.
7. Faça o deploy e copie o endereço HTTPS gerado. Não precisa criar Web Service, disco ou banco no Render.

O arquivo [`render.yaml`](render.yaml) também permite criar um Blueprint com essa configuração. Preencha as duas variáveis solicitadas. Se alterar variáveis Vite, faça um novo build/deploy: os valores são incorporados ao JavaScript público.

## 4. Finalizar autenticação

No Supabase, em **Authentication → URL Configuration**:

- **Site URL:** `https://SEU-SITE.onrender.com`.
- **Redirect URLs:** adicione exatamente `https://SEU-SITE.onrender.com/` e o endereço local usado no desenvolvimento.
- Se adotar domínio próprio, atualize ambos e repita o teste dos e-mails.

Crie uma conta pela aplicação, confirme o e-mail e crie seu quadro. Nenhum usuário ou administrador de aplicação é criado pela migração.

Para convidar alguém: **Participantes → informar e-mail e papel → Gerar convite**. Copie o link e envie à pessoa por um canal privado. Ela cria/confirma a conta do mesmo e-mail e aceita o convite após entrar. O link expira em sete dias, pode ser revogado e não envia e-mail automaticamente.

## 5. Homologar antes de apresentar

Use dois navegadores ou uma janela anônima para contas diferentes:

1. Crie um quadro, convide uma segunda conta como editor e confirme que ela só vê quadros dos quais participa.
2. Crie A, B, C e D; faça B depender de A e C depender de A e D. A deve indicar que libera **uma tarefa**, não duas.
3. Tente criar A dependendo de B: deve recusar o ciclo. Tente iniciar C: deve recusar por bloqueio.
4. Conclua A. B deve ser desbloqueada nas duas telas; C continua bloqueada por D.
5. Inicie B e tente reabrir A: deve recusar até B voltar para A fazer.
6. Abra o mesmo cartão nas duas contas. Salve em uma e tente salvar a edição antiga na outra: deve pedir atualização, sem sobrescrever.
7. Altere o convidado para leitor. Confirme que pode consultar, mas não criar, comentar nem alterar cartões.
8. Remova o participante e confirme que perde acesso. Teste também recuperação de senha, convite revogado/expirado, arquivar/restaurar e acesso móvel.

## Verificações automatizadas

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Os testes SQL usam PostgreSQL embarcado (PGlite) com um substituto mínimo do Auth; os testes de interface usam respostas simuladas. Auth/SMTP/Realtime e concorrência entre duas conexões reais devem ser homologados no seu Supabase. O CI executa testes e build a cada push e pull request.

## Estrutura

```text
src/                 Interface, cliente Supabase e cálculo do Efeito Dominó
supabase/migrations/ Esquema, RLS e funções transacionais
tests/               Testes das regras e do banco
e2e/                 Testes no navegador
render.yaml          Configuração de hospedagem
docs/                Regras e limites
```

## Documentação dos serviços

- [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Funções do banco](https://supabase.com/docs/guides/database/functions)
- [Autenticação e senhas](https://supabase.com/docs/guides/auth/passwords)
- [SMTP próprio](https://supabase.com/docs/guides/auth/auth-smtp)
- [Realtime](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Static Sites do Render](https://render.com/docs/static-sites)
- [Rewrites](https://render.com/docs/redirects-rewrites)
