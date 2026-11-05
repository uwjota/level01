# Central Pessoal — arquitetura

## Fronteiras

Next.js App Router + TypeScript. Páginas autenticadas no grupo `(private)`; login e recuperação públicos, sem cadastro. Supabase SSR usa cookies e valida identidade no servidor. Route Handler `/api/data/[entity]` valida operações com Zod, atribui proprietário a partir da sessão e usa cliente de usuário sujeito a RLS. Sem service_role na aplicação.

## Páginas

- `/`: resumo real de tarefas, contas, movimentos, metas e agenda.
- `/tarefas`: filtros, séries e exceções por ocorrência.
- `/calendario`: mês, semana e agenda com os mesmos dados de tarefas.
- `/financeiro`: movimentos, contas, categorias, recorrências e relatórios.
- `/metas`: progresso manual e histórico transacional.
- `/cofre`: notas comuns e credenciais criptografadas; desbloqueio independente.
- `/configuracoes`: perfil, tema, notificações, backup, segurança.

## Dados

Todas as entidades pessoais possuem `user_id`, UUID, timestamps e RLS. Relações usam `(id,user_id)` para impedir referências entre proprietários. `tasks` guarda regra de recorrência validada; `task_occurrences` guarda apenas exceções, com unicidade `(task_id, occurrence_date)`. Ocorrências são calculadas em uma janela finita no fuso do usuário, sem gerar infinitas linhas.

`financial_accounts`, `financial_categories`, `transactions`, `financial_recurrence_rules`: centavos em bigint limitado ao inteiro seguro JS; transferências têm destino distinto e não entram em receitas/despesas. Recorrências materializam apenas previstos com chave única por regra/data. Saldo considera só confirmados. `goals` e `goal_updates` são atualizados atomicamente. `notes`, `vault_configs`, `vault_items`, `attachments`, `notifications` e `settings` completam o modelo.

## Fluxos

Login → sessão validada → leituras/persistência com RLS. Editar tarefa recorrente oferece ocorrência ou série; concluir grava exceção na data original, mantendo futuras pendentes. Finanças: registrar previsto → confirmar → saldo recalculado. Transferências afetam origem e destino num único registro. Metas guardam histórico por trigger.

Cofre: senha mestra → PBKDF2-HMAC-SHA256 (600.000 iterações, salt aleatório de 16 bytes, Web Crypto nativo) → chave de proteção → desbloqueia chave aleatória AES-256-GCM. Cada item/anexo usa IV aleatório de 96 bits e AAD que vincula versão, usuário e ID. Chaves e plaintext ficam apenas em memória. Troca de senha reencapsula chave de dados. KDF nativa é alternativa documentada ao Argon2id, sem alegação de auditoria. Perder senha mestra pode tornar dados irrecuperáveis.

Backup JSON versionado com ciphertext e configuração criptográfica; restauração por função SQL em transação, com validação de vínculos e deduplicação. Arquivos são opcionais e ficam em bucket privado. A aplicação não mantém cache offline de dados pessoais.

## Entrega verificável

Testes de domínio (recorrência, centavos/transferências), Web Crypto (senha errada, adulteração, anexos, troca de senha), banco (RLS/ownership/atomicidade) e build. Testes remotos exigem projeto Supabase ativo e conta provisionada pelo administrador. Web Push depende de VAPID/agendador e não será anunciado como ativo sem configuração e teste.
