# Entrega e verificações

## Situação em 4 de novembro de 2026

O destino final confirmado é **uwjota's Project** (`gbmagplhoavukopvvssw`), organização `org01`. A estrutura antiga (incluindo 2 notas e 1 perfil) foi removida conforme autorização explícita. As sete migrações estão aplicadas; `.env.local` contém a URL e a chave publicável corretas. A conta existente em Supabase Auth foi mantida para acesso. A aplicação começa sem tarefas, notas, contas financeiras, movimentações, metas ou credenciais. Não há arquivos antigos no Storage.

## Evidências locais

- TypeScript e build Next.js de produção executados. A suíte local alcançou 91 testes passando.
- Testes de domínio: datas, recorrências, ocorrência isolada/reagendada, meses curtos, fuso, DST/antecedência, centavos, transferências e CSV.
- Testes Web Crypto: ciphertext sem plaintext, senha errada, adulteração, troca de contexto, IVs diferentes, anexos, backup criptografado e troca de senha mestra.
- Migrações executadas em PostgreSQL embarcado: RLS, negação anônima, isolamento entre dois proprietários, imutabilidade do dono, FKs compostas, unicidade, ocorrência por RPC, histórico de metas, Storage privado simulado e restauração transacional/deduplicação.
- Testes DOM: formulário de tarefa, centavos no financeiro, falha de persistência sem fechar formulário, estados vazios acionáveis e limpeza das credenciais após timeout, registro efêmero da busca do Cofre e envio exclusivo de ciphertext ao salvar credenciais.
- HTTP local com Supabase configurado: login 200, página privada redireciona 307, API sem sessão retorna 401 com no-store. Nonces de CSP são diferentes por requisição e correspondem a todos os scripts do HTML. Não existe fallback com dados fictícios.
- Não há navegador conectado nesta sessão. Inspeção visual, toque real, instalação PWA e acessibilidade em navegador ainda não foram verificados.

## Evidências no Supabase remoto

- Projeto `ACTIVE_HEALTHY`; migrações `central_schema`, `integrity_hardening` e `foreign_key_indexes` aplicadas e nomes locais alinhados ao histórico remoto.
- `verify:supabase`: nenhuma leitura anônima de tarefas, financeiro, notas, Cofre, configurações ou arquivos.
- `scripts/verify-remote-rls.sql`: CRUD e regras testados com roles PostgreSQL authenticated/anon e identidades controladas na transação. Isolamento de SELECT/UPDATE/DELETE, transferências inválidas, histórico de metas e identidade de ocorrências passaram. A transação inteira foi revertida.
- Contagem final confirmou zero registros pessoais nos módulos, RLS ativo em todas as tabelas públicas e bucket `personal` privado.
- A configuração pública de Auth foi verificada novamente após o ajuste do usuário: `disable_signup: true`. O cadastro público está desativado.
- Advisor de segurança apontou proteção contra senhas vazadas desabilitada. Consulte a [correção oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); sua disponibilidade pode depender do plano. Não foi habilitada automaticamente.
- Avisos de índices de FKs foram corrigidos na terceira migração. Índices novos sem uso são esperados na base vazia.

## Pendências para a entrega integral solicitada

| Item                                                        | Estado / motivo                                                            | Como concluir                                                                                                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, recuperação, sessão e CRUD pela interface            | Banco integrado; autenticação pela interface ainda não verificada          | Usar a conta existente, configurar SMTP/URLs e percorrer os módulos. Signup já está desativado.                                                                                                 |
| RLS/Storage via sessões e arquivos reais                    | Políticas e roles SQL verificadas; upload por sessão de navegador pendente | Testar upload/download e isolamento de duas contas em ambiente de teste.                                                                                                               |
| Desktop/mobile e acessibilidade visual                      | CSS responsivo e componentes acessíveis, sem inspeção visual               | Testar 360, 390, 768, 1280 e 1440 px, teclado, zoom 200%, foco de modal e contraste dos dois temas.                                                                                    |
| Deploy/domínio                                              | Configuração de build e instruções incluídas                               | Vincular repositório/projeto Vercel, configurar env e publicar preview; aprovar o comportamento real antes da produção.                                                                |
| Web Push e agendamento com app fechado | Configurados no Supabase; cron e função com HTTP 200 verificados | Ativar a permissão e confirmar entrega em dispositivo real. |
| MFA/TOTP opcional | Interface e enforcement AAL2 implementados, com testes SQL/DOM | Validar com o autenticador pessoal antes de depender exclusivamente do recurso. |
| Backup entre contas ou Cofres com configurações divergentes | Recusado para preservar AAD/chaves                                         | Criar migração explícita autenticada no cliente, com recriptografia e remapeamento de vínculos; nunca trocar apenas `user_id`.                                                         |
| Registros de backup maiores que 3 MB                        | Limite do corpo de Functions                                               | Ampliar staging para registros. Pacotes de arquivos já têm upload individual privado e limite total de 50 MB.                                                                          |
| Preferências avançadas de dashboard/formato de data         | Dashboard fixo, datas pt-BR                                                | Adicionar seleção de cards e formatos mantendo coerência dos filtros/exports.                                                                                                          |
| Segurança independente do Cofre                             | Testes locais, sem auditoria                                               | Revisão independente de protocolo, dependências, CSP e fronteiras de memória/transporte.                                                                                               |

## Matriz de aceite remoto

1. Login válido/inválido, recuperação no mesmo navegador e logout global. Nenhuma conta pública pode ser criada.
2. Criar/editar/excluir tarefa única e série segunda/quarta/sexta; concluir uma data; reagendar só uma ocorrência; encerrar série; conferir calendário.
3. Criar duas contas, receita, despesa prevista e transferência; conferir saldo consolidado antes/depois de confirmar. Gerar previsões duas vezes e verificar ausência de duplicatas.
4. Criar meta, atualizar progresso duas vezes, conferir histórico. Criar nota, favorito, pesquisa e anexo.
5. Inicializar Cofre com senha exclusiva; salvar credencial; confirmar pelo payload da rede/DB que há somente ciphertext; bloquear e testar senha errada/correta; trocar senha; testar anexo e timeout.
6. Exportar backup, restaurar em ambiente de teste do mesmo usuário, conferir vínculos e duplicatas; inserir um erro no backup e verificar ausência de alterações parciais.
7. Conferir notificações nas categorias habilitadas, leitura e exclusão; nenhum segredo no texto.
8. Validar menus, Ctrl/Cmd+K, formulários, teclado e mobile. Instalar PWA e verificar que nenhum dado sensível é cacheado.

## Correção das gravações locais

A comparação de origem usava `nextUrl.origin`, que no servidor iniciado com `--hostname 0.0.0.0` era diferente do endereço `localhost` enviado pelo navegador. As rotas de escrita agora conferem a origem contra o protocolo da requisição e o header `Host`, sem confiar em `X-Forwarded-Host`. Login e callback também mantêm o host acessado pelo usuário.

Validação: 54 testes e TypeScript passaram; os testes da API cobrem criação, edição e exclusão com sessão/cliente de banco simulados, ausência de sessão e rejeição de origens externas. No servidor local, o callback redirecionou corretamente para `localhost` e `127.0.0.1`; a API de recorrências passou da validação de origem para a exigência de autenticação (401), mantendo 403 para origem externa. O teste remoto de acesso anônimo ao Supabase passou. O usuário confirmou que uma tarefa foi salva e permaneceu após atualizar a página na sessão real.

## Identidade Level01

Nome, favicon, ícones PWA e metadados atualizados para Level01. A marca usa tipografia sem o bloco L1. A base visual mantém preto e branco, com avisos laranja, entradas verdes e saídas vermelhas nos temas claro e escuro. Cabeçalhos e estados vazios usam nomes diretos; frases decorativas removidas. Gráficos mantêm legendas e tons distintos, e os indicadores mantêm seus rótulos. Nenhuma migração ou alteração de dados foi necessária. Inspeção visual no navegador segue pendente por falta de navegador conectado.

## Estudos e refinamentos de navegação

A aba `/estudos` inclui livros e matérias, CRUD de notas Markdown, tags, referência externa, links entre notas, backlinks e arquivos privados via a interface existente. A navegação inferior do mobile foi removida; o menu lateral mantém todas as abas.

Migração remota `20261104200207_studies_workspace.sql` aplicada: duas novas tabelas com RLS, permissões explícitas, vínculos compostos por dono, índices, proteção contra anexos órfãos e integração com restauração de backup e exclusão de dados. Uma transação no projeto real validou inserção, edição, leitura, exclusão e isolamento por `auth.uid()` com rollback. O teste remoto anônimo também passou para as duas tabelas. Não há novos avisos de segurança ou de índice sem cobertura; permanece o aviso preexistente de [proteção de senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Testes adicionais cobrem isolamento, vínculos, restauração, exclusão, editor, erro ao salvar com preservação de rascunho, Markdown, backlinks e bloqueio de HTML/URLs executáveis. Upload e inspeção visual com sessão real de navegador permanecem pendentes; não há navegador conectado.

## Início, clima, notícias, Web Push e segurança

- Início reorganizado com saldo até a data atual, tarefas do dia, avisos acionáveis, previsão e notícias com fonte/horário. Localização aproximada do dispositivo por consentimento ou cidade manual; o valor fica no perfil e acompanha o backup.
- Migrações de `home_push_security`, `push_scheduler` e `push_public_configuration` aplicadas. Inscrições, fila, políticas MFA, configuração pública e cron estão configurados. Nenhuma senha ou fator pessoal foi alterado/ativado automaticamente.
- Edge Function `level01-reminders` ativa; chamadas sem token retornaram 401, chamadas autorizadas retornaram 200. Execuções automáticas do cron foram confirmadas em `cron.job_run_details` e `net._http_response` com status 200 e sem timeout. A entrega no navegador depende da inscrição e permanece pendente de confirmação no dispositivo.
- Testes cobrem antecedência atravessando meia-noite, exceções de recorrência, horários sem hora marcada, parsing seguro dos feeds, recusa de destinos push arbitrários, permissão de localização, escolha manual de cidade, inscrição push, MFA e comparação de senhas.
- O worker usa a chave de serviço apenas na Edge Function. VAPID e token do cron ficam no Vault; a tabela de configuração expõe apenas a chave pública.

## Revisão de navegação, clima, push e logo

Veja [o relatório da revisão](REVISAO-LEVEL01.md). O usuário confirmou o recebimento de um push real no localhost. Nova logo aplicada nos temas e ícones; navegação interna suavizada, localização com recuperação manual e erros específicos, testes local/remoto separados. Suíte: 91 testes aprovados; build e TypeScript aprovados.
