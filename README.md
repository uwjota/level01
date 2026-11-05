# Level01

Aplicação privada de produtividade, finanças e organização. Next.js App Router + TypeScript, React, Tailwind, componentes locais com Radix, Supabase Auth/Postgres/Storage e Cofre com Web Crypto.

**Estado: implementação local integrada ao Supabase, com testes automatizados. Projeto Supabase escolhido: `uwjota's Project` (`gbmagplhoavukopvvssw`). Gravação e persistência de uma tarefa confirmadas pelo usuário na sessão real. Publicação ainda pendente.** A URL e a chave pública correta estão em `.env.local`. As sete migrações foram aplicadas, a estrutura antiga foi removida conforme autorização e o acesso ao banco já foi verificado remotamente. Sem configuração, a aplicação mostra uma tela explicativa de conexão; não oferece login falso, banco em localStorage ou dados fictícios.

Leia [a arquitetura](docs/ARQUITETURA.md), [a segurança](docs/SEGURANCA.md) e [as pendências e validações](docs/ENTREGA.md).

## Executar

Requer Node **22.12 ou superior da linha 22** e npm. As versões estão fixadas e o lockfile deve ser preservado.

```bash
nvm use # se você utiliza nvm
npm ci
# Somente em uma instalação nova (não sobrescreva seu .env.local configurado):
test -f .env.local || cp .env.example .env.local
# Preencha .env.local localmente com URL e chave PUBLICÁVEL do projeto correto.
npm run dev
```

Acesse `http://localhost:3000`. Para produção local:

```bash
npm run build
npm start
```

O ambiente original tinha Node 20; os checks desta entrega utilizaram Node 22.23.4, obtido do site oficial e verificado por SHA-256, em `/tmp/central-node`. Esse caminho temporário não é um requisito do projeto. Instale Node 22 no seu ambiente habitual.

## Configurar Supabase

1. Selecione um projeto dedicado, ativo, **uwjota's Project**. Confirme o identificador, não apenas o nome. O usuário autorizou uma base limpa, sem preservar os dados anteriores desse projeto.
2. No projeto atual, **Allow new users to sign up** já foi desativado e verificado (`disable_signup: true`). Em novas instalações, desative cadastro público e acesso anônimo em Auth. O aplicativo não inclui cadastro, mas o bloqueio do endpoint de cadastro também precisa estar configurado no serviço.
3. Provisione a conta pelo painel administrativo do Supabase, fora do fluxo público. Não coloque e-mail/senha fixos no código. Configure SMTP para recuperação de acesso em produção.
4. Configure `Site URL` para a URL exata da aplicação e permita `https://SEU_DOMINIO/auth/callback` e `http://localhost:3000/auth/callback` apenas nos ambientes necessários. Não use curingas amplos em produção. O fluxo usa PKCE; abra o link de recuperação no mesmo navegador que o solicitou.
5. As migrações em `supabase/migrations/` já foram aplicadas ao projeto escolhido. Para uma instalação nova, aplique-as na ordem usando o SQL Editor ou a CLI fixada no projeto. **Não reexecute a migração inicial sobre o Level01 já instalado:** ela contém a limpeza autorizada da estrutura antiga. Antes de aplicar a um projeto existente, inspecione suas tabelas: o esquema utiliza nomes no schema `public` e pressupõe um projeto dedicado sem tabelas conflitantes.
6. O bucket privado `personal` e suas políticas são criados na primeira migração. Não transforme o bucket em público.
7. Copie somente a URL pública e a chave publicável `sb_publishable_…` para `.env.local`. **Não use `service_role` nem uma chave secreta na aplicação.**

CLI **3.0.0** (a sintaxe foi conferida em `--help`):

```bash
npx supabase login
npx supabase link --project-ref IDENTIFICADOR_DO_PROJETO
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

Na CLI 3, comandos de banco têm alvo local por padrão; `--remote` é necessário para o projeto vinculado. Confira o alvo na confirmação. O arquivo `supabase/config.toml` configura o desenvolvimento local e não substitui automaticamente as configurações do projeto hospedado.

## Verificação

```bash
npm run typecheck
npm test
npm run build
npm run verify:supabase
```

O último comando requer `.env.local` configurado e verifica leitura anônima no projeto real, sem criar dados. Os testes SQL usam PostgreSQL embarcado (PGlite), executam as migrações reais e simulam os schemas de infraestrutura `auth`/`storage`. Eles não substituem o teste com Supabase Auth, PostgREST e Storage hospedados.

Os testes DOM usam dados de teste apenas dentro de `tests/`. Não há seed, modo de demonstração ou bypass de autenticação na aplicação.

## Funcionalidades implementadas

- Login por senha, recuperação PKCE, logout e encerramento global de sessões; rotas protegidas no servidor.
- Dashboard com dados reais e estados vazios; criação rápida, busca Ctrl/Cmd+K, navegação móvel e temas.
- CRUD de tarefas; recorrências diárias, semanais por dias, mensais, anuais e por intervalo; exceções independentes, reagendamento e edição da série.
- Calendário mensal, seleção diária, semana/lista de agenda e criação por data; dados compartilhados com tarefas.
- Contas e categorias; entradas, saídas, transferências e previsões; valores em centavos e restrições SQL. Recorrências são materializadas em uma janela de 90 dias ao abrir o app e ao salvar a regra. A unicidade impede duplicações.
- Relatórios de entradas/saídas, categorias e saldo; filtros e exportação CSV. Transferências não integram receitas/despesas.
- Metas com atualização manual e histórico gravado na mesma transação.
- Anotações com etiquetas, categorias, pesquisa e favoritos. Texto é apresentado como texto, sem HTML arbitrário.
- Estudos com livros, matérias, notas Markdown, links `[[nota]]`, backlinks, tags, referências e anexos privados. Veja [como usar Estudos](docs/ESTUDOS.md).
- Cofre com AES-256-GCM, PBKDF2-SHA256 (600.000 iterações), chave de dados aleatória, senha mestra independente, busca local no Cofre e no menu global durante o desbloqueio, geração/cópia de senha, troca da senha mestra, bloqueio por inatividade/aba oculta.
- Anexos privados de notas, transações e credenciais; limite de 2 MiB no arquivo original, MIME/assinatura de arquivo validados, progresso, pré-visualização, download autenticado e exclusão. Credenciais, nome e conteúdo de seus anexos são criptografados no navegador.
- Início com tarefas de hoje, saldo atual, avisos, clima por localização aproximada/cidade e manchetes de Agência Brasil/g1.
- Lembretes internos e Web Push com agendador Supabase a cada minuto, inscrições por dispositivo, fila com deduplicação e tentativas de reenvio. [Ativação e operação](docs/INICIO-NOTIFICACOES.md).
- Troca de senha dentro do app e MFA/TOTP opcional com exigência AAL2 no proxy, páginas privadas e políticas do banco/Storage.
- Backup JSON versionado, com Cofre criptografado, arquivos opcionais com hashes SHA-256, prévia de importação, deduplicação e restauração atômica no banco. Os arquivos são preparados em Storage privado antes do commit. Exportação adicional de tarefas, notas/metas e financeiro.
- Exclusão total em Configurações, com confirmação textual, reautenticação, limpeza dos arquivos privados e remoção transacional dos registros.
- Manifest, ícones e Service Worker de rede sem cache de conteúdo pessoal.

## Decisões de comportamento

- Dinheiro: `100` representa R$ 1,00. O campo de entrada aceita `1.234,56`. Despesas previstas não afetam saldo. Saldo de abertura não é receita.
- Séries: datas civis e horários locais são mantidos separadamente; o fuso do perfil determina os lembretes. Recorrência mensal no dia 31 usa o último dia dos meses curtos e volta ao dia 31 no seguinte. Intervalos semanais são ancorados na semana de domingo da primeira data. A visualização de tarefas cobre um ano anterior e um ano futuro; a janela é finita.
- Séries financeiras: editar uma regra afeta as novas previsões. Movimentações já materializadas permanecem para edição explícita; registros confirmados nunca são substituídos automaticamente.
- Arquivos: remova os anexos antes de excluir um registro que os possui. Isso evita arquivos órfãos causados pela exclusão do registro pai.
- Backup: restaura registros ausentes e preserva existentes, incluindo edições feitas após a exportação. Não é uma operação de sobrescrever tudo. O backup precisa pertencer ao mesmo usuário. Configurações de Cofre divergentes são recusadas para impedir mistura de chaves.
- Relatórios: exibem o histórico registrado, incluindo o saldo de abertura. Não representam conciliação bancária. Nenhuma integração bancária foi implementada.

## Publicar na Vercel

1. Versione o projeto em um repositório privado e importe-o na Vercel, com framework Next.js e Node 22.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_APP_URL` nos ambientes corretos. Variáveis públicas são incorporadas no build: após alterá-las, faça novo deploy.
3. Aplique e valide primeiro as migrações no Supabase. Faça um preview, provisione o usuário e teste os fluxos reais antes de promover para produção.
4. A região `gru1` está declarada em `vercel.json`; ajuste se o banco estiver em outra região.
5. Adicione o domínio pelo painel da Vercel e use os registros DNS que ele fornecer. Depois configure a URL exata e o callback no Supabase. Não existe domínio escolhido ou comprado nesta entrega.
6. Rode o teste anônimo e a matriz em `docs/ENTREGA.md` no preview e na URL final.

Não foram provisionados projetos pagos nem domínio. Cron, VAPID e Web Push foram configurados no Supabase existente. O plano de hospedagem não foi selecionado. Requisições e respostas de Functions têm limite documentado de 4,5 MB; os anexos originais foram limitados a 2 MiB para acomodar criptografia/base64. Backups JSON pela API têm limite explícito de 3 MB. Esse limite de 3 MB se aplica aos registros; os arquivos opcionais são empacotados no navegador (até 50 MB no total) e restaurados individualmente em staging privado. Registros maiores que 3 MB ainda exigem ampliar o fluxo de staging.

O agendamento roda no Supabase Cron, sem depender de Vercel Cron. O recebimento no dispositivo exige permissão de notificações e navegador compatível; no mobile, use uma publicação HTTPS. O usuário precisa confirmar a entrega pelo botão de teste.

## Estrutura

```text
src/app/                  rotas, login, API, manifest e proteção
src/components/           módulos e UI reutilizável
src/lib/                  validações, domínio, criptografia e clientes Supabase
supabase/migrations/      tabelas, índices, RLS, Storage e funções transacionais
tests/                    domínio, crypto, SQL e fluxos DOM
scripts/verify-supabase.mjs teste remoto anônimo sem escrita
docs/                     arquitetura, segurança e pendências
```

## Documentação consultada

- [Next.js — instalação](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase — SSR com Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — CLI 3](https://supabase.com/changelog/supabase-cli-v3)
- [OWASP — parâmetros de derivação de senha](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [date-fns-tz — conversão de horários locais](https://github.com/marnusw/date-fns-tz)
- [Vercel — limites de Functions](https://vercel.com/docs/functions/limitations)
- [Vercel — execução de Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
