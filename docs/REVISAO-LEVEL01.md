# Revisão do Level01 — 04/11/2026

## Navegação e marca

- Atalhos da conta, criação de credencial e resultados de Estudos usam navegação do Next, preservando a estrutura da aplicação.
- Loading de rota, sinal de navegação pendente, entrada discreta do conteúdo e abertura do menu lateral. A preferência de redução de movimento é respeitada.
- Menu mobile com Escape, contenção de foco, bloqueio de rolagem do fundo e retorno do foco ao fechar.
- Preferências e edições comuns atualizam o estado com a resposta confirmada do banco, sem recarregar as 14 tabelas. Atualizações com efeitos em outras tabelas continuam sincronizando esses vínculos.
- Resultados de busca em Estudos funcionam mesmo quando a aba já está aberta; o cancelamento do descarte mantém o rascunho. O atalho de credenciais também acompanha a URL na aba Cofre.
- As duas imagens originais entregues em `src` foram preservadas e copiadas para `public/brand`. A interface escolhe a versão preta/branca conforme o tema. Favicon e ícones PWA usam a nova marca.

## Clima

- Selecionar novamente a mesma cidade recarrega a previsão; não deixa o cartão vazio.
- Falha de localização distingue permissão negada, posição indisponível, timeout e endereço inseguro.
- A busca manual continua disponível enquanto o navegador procura a localização. Uma resposta tardia de geolocalização não substitui a cidade escolhida.
- Sessão expirada e falhas da API aparecem com mensagens específicas. Requisições têm limite de espera e o clima atualiza a cada dez minutos quando a página está visível.
- Open-Meteo e busca de cidades retornaram HTTP 200. APIs foram testadas com autenticação simulada, validação de coordenadas, conversão do formato e indisponibilidade do provedor. A localização física depende do navegador; não havia navegador conectado para reproduzir a obtenção da posição real.

## Notificações

- Um teste real foi enviado pelo agendador e aceito pelo serviço de push na primeira tentativa; o usuário confirmou que o aviso apareceu no computador em localhost.
- O painel distingue teste local de exibição e teste de envio em segundo plano, apresenta bloqueio de permissão e permite atualizar o status.
- Espera pelo service worker tem limite e utiliza a inscrição ativa. Chaves de inscrição antigas são renovadas quando necessário. A política de conteúdo permite explicitamente o worker da própria origem.
- Erros de consulta no Supabase não são mais mascarados como falta de configuração. Teste de envio sem inscrição retorna erro acionável.
- Nenhuma migração adicional foi necessária nesta revisão.

## Verificação geral

**91 testes passaram; TypeScript e build de produção concluíram sem erros.** Os testes cobrem tarefas, finanças, recorrências, cofre, estudos, backups, autenticação/origem, MFA, isolamento de dados, clima, push e atualização do estado. Verificação de produção por HTTP confirmou login, novas imagens, service worker e proteção das APIs sem sessão.

A auditoria de dependências não encontrou vulnerabilidades conhecidas. O advisor do Supabase não reportou novos problemas de segurança nem avisos de desempenho; permanece o aviso anterior de proteção contra senhas vazadas desativada. Os índices sem uso são informativos e foram mantidos.

A inspeção visual responsiva permanece pendente porque não há navegador conectado às ferramentas. Os PNGs da marca e o ícone gerado foram inspecionados diretamente.
