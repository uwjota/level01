# Segurança e limites de confiança

## Autenticação e autorização

Identidade validada com Supabase Auth no servidor (`getUser`) e atualização de cookies no proxy (`getClaims`). As rotas do app acessam dados com o token do usuário. A Edge Function de lembretes usa a service_role somente no servidor para processar a fila de todas as contas; essa chave nunca é enviada ao navegador. APIs recusam mutações com Origin diferente da aplicação. Campos são validados com Zod, proprietário vem da sessão e os vínculos compostos impedem referências cruzadas entre usuários.

Todas as tabelas públicas têm RLS e privilégios explícitos. Dados pessoais usam políticas por proprietário; a fila push é exclusiva do worker, e a configuração pública de push só permite leitura autenticada. UPDATE tem USING e WITH CHECK; trigger adicional impede mudanças de identidade e proprietário. Funções de domínio são SECURITY INVOKER, têm search_path fixo e EXECUTE restrito quando expostas. Não há views que contornem RLS.

O cadastro público precisa ser desabilitado no painel Supabase antes de produção. Ausência de botão de cadastro não basta. A aplicação oferece MFA/TOTP opcional com enrollment, QR/chave manual, confirmação e desativação mediante código. Uma vez verificado o fator, uma política restritiva exige AAL2 em todos os dados pessoais e objetos privados do Storage. A função de verificação fica no schema privado e consulta o estado real dos fatores; apenas confiar na interface não seria suficiente. A recuperação sem autenticador exige intervenção administrativa, não há códigos de recuperação de uso único nesta versão. Sessões globais revogadas podem manter access tokens válidos até a expiração no serviço; ajuste a duração dos JWTs conforme o risco.

## Criptografia do Cofre

- AES-256-GCM, tag de 128 bits, IV de 96 bits obtido por `crypto.getRandomValues` a cada operação.
- Salt aleatório de 128 bits, PBKDF2-HMAC-SHA256 com 600.000 iterações; parâmetros versionados. PBKDF2 nativo foi escolhido como alternativa compatível com navegadores, sem uma dependência WASM adicional. Argon2id não foi implementado.
- Uma chave de dados aleatória de 256 bits é encapsulada pela chave derivada da senha mestra. A troca de senha altera apenas o encapsulamento, com comparação atômica da configuração anterior.
- AAD vincula versão, usuário, tipo e identidade do item. Trocar ciphertext entre itens/usuários falha na autenticação.
- Senha mestra e plaintext nunca são enviados ao backend, incluídos em URLs ou gravados em localStorage, IndexedDB, Service Worker ou logs.
- Chaves importadas não são extraíveis e ficam em memória. O bloqueio limpa as referências de chave e os estados dos formulários/itens. JavaScript/GC não permite prometer eliminação física imediata de todas as cópias em memória.
- Ao ocultar a aba ou encerrar a página do Cofre, a sessão desbloqueada é descartada. A busca de credenciais é somente local na página do Cofre desbloqueado; o menu global recebe uma função efêmera de busca local enquanto o Cofre estiver desbloqueado. A função é removida ao bloquear ou sair do Cofre.
- Anexos de credenciais: nome, MIME e bytes são colocados em um payload criptografado. O servidor só recebe o envelope e metadados de vínculo/tamanho. Timestamps e quantidade/tamanho de itens não são escondidos.
- A área de transferência do sistema não é um cofre: cópia é uma ação explícita do usuário; não prometemos limpar históricos de clipboard do sistema.
- Não existe recuperação administrativa da senha mestra. Perder a senha sem cópia recuperável pode tornar os dados inacessíveis. Recuperar login não descriptografa o Cofre.

**Não houve auditoria independente.** Os testes demonstram propriedades específicas, não ausência de todas as vulnerabilidades. XSS, extensões maliciosas ou comprometimento do código servido podem acessar segredos durante uma sessão desbloqueada. A CSP usa nonce por requisição e strict-dynamic para scripts, bloqueia objetos e limita conexões. Frames são permitidos apenas para blobs locais de pré-visualização; style-src mantém unsafe-inline para estilos de componentes. O HTML é dinâmico e não compartilhado em cache. Não há analytics nem scripts externos.

## Arquivos e backup

Bucket privado, caminho `user_id/entidade/id/uuid`, políticas por proprietário. Tipos e assinaturas de arquivos comuns são validados; conteúdo criptografado é opaco para o servidor. Download é autenticado e retornado como attachment/octet-stream. Excluir um pai com anexos é recusado até remover os arquivos.

Backup JSON inclui dados comuns legíveis e envelopes do Cofre. Proteja o backup em repouso. Metadados e, opcionalmente, bytes dos arquivos são incluídos com hashes SHA-256. A restauração prepara arquivos privados antes da transação de metadados. Quando o resultado do commit é incerto por falha de rede, os arquivos preparados são preservados; uma resposta perdida não autoriza removê-los. Arquivos temporários não vinculados podem exigir limpeza posterior. Restauração usa uma única função/transação no PostgreSQL e não modifica registros já existentes. IDs e vínculos são preservados; misturar configurações de chaves distintas é recusado. Limite de registros pela API: 3 MB; arquivos incluídos no pacote: até 50 MB. A exclusão total exige confirmação e reautenticação na interface/API, mas cada usuário já tem permissão RLS para excluir seus próprios registros diretamente. Storage e PostgreSQL não compartilham uma transação: a exclusão total pode precisar de nova tentativa após falha parcial na remoção de arquivos.

## Antes de dados reais

Aplicar migrações, desabilitar signup, testar login/recuperação com SMTP, testar RLS/Storage real com duas contas temporárias, verificar recuperação de backup e revisar configurações do serviço. Não armazenar credenciais importantes antes dessa validação e da revisão de segurança adequada ao uso pretendido.

## Envio de lembretes

VAPID e token do cron ficam criptografados no Supabase Vault. A função pública de configuração é SECURITY INVOKER e só lê a tabela com a chave **pública**; a leitura do runtime secreto exige service_role. A Edge Function valida o token interno antes de consultar dados de lembretes. Endpoints de entrega aceitos são restritos a provedores conhecidos (Apple, Google, Mozilla e Windows), com HTTPS e sem redirecionamentos.

O push mostra texto genérico, sem títulos pessoais ou valores. A fila usa unicidade por inscrição/notificação, lease com bloqueio concorrente e até cinco tentativas com intervalo crescente. HTTP 404/410 remove inscrições expiradas. O Service Worker não guarda conteúdo pessoal em cache e só abre rotas permitidas da própria origem. Revogar uma inscrição impede futuros envios; a exclusão dos dados também remove as inscrições.

## Clima e notícias

A geolocalização só solicita permissão após ação do usuário. Coordenadas do dispositivo são arredondadas para duas casas decimais e podem ser substituídas por cidade manual. A previsão vem do Open-Meteo. Notícias usam feeds fixos de Agência Brasil e g1; apenas manchete, data, fonte e link são apresentados. XML com DOCTYPE/ENTITY é recusado e títulos são exibidos como texto, sem HTML executável.
