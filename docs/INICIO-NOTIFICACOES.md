# Início, notificações e segurança

## Usar o início

O saldo soma contas e movimentações confirmadas até hoje; lançamentos futuros não entram no saldo atual. Tarefas pendentes aparecem antes das concluídas, e os avisos podem ser marcados como lidos no próprio início.

No clima, clique em **Usar minha localização** e conceda a permissão, ou em **Escolher cidade**. Se a localização já estiver autorizada e o modo dispositivo estiver selecionado, ela será atualizada na próxima abertura. A consulta usa coordenadas aproximadas. O botão de localização permite mudar para outra cidade. Dados indisponíveis mostram erro e opção de tentar novamente, sem valores fictícios. Previsão: [Open-Meteo](https://open-meteo.com/).

As manchetes vêm de [Agência Brasil](https://agenciabrasil.ebc.com.br/feed/) e [g1](https://g1.globo.com/rss/g1/), com data, fonte e link para o texto original. Atualização em cache de até dez minutos.

## Receber com o painel fechado

1. Abra **Configurações → Lembretes → Ativar notificações**.
2. Autorize o navegador. A inscrição vale para aquele dispositivo/navegador.
3. Use **Testar neste dispositivo** para conferir a exibição local. Depois clique em **Testar envio em segundo plano** e aguarde até um minuto.
4. Repita a ativação em cada dispositivo desejado. **Desativar** remove a inscrição atual.

O backend já está ativo no projeto `gbmagplhoavukopvvssw`: Supabase Cron executa `private.run_reminder_tick()` a cada minuto, que chama a Edge Function `level01-reminders`. Não depende da aplicação Next estar aberta ou do Vercel Cron. O recebimento ainda depende do sistema operacional e das permissões do navegador. No desktop local, `localhost` pode usar Web Push; acesso por IP HTTP não é contexto seguro. No iPhone/iPad, use a versão HTTPS adicionada à Tela de Início. Veja [Web Push no WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) e [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

Tarefas com horário respeitam a antecedência do perfil, inclusive atravessando a meia-noite. Tarefas sem horário e lembretes financeiros/de metas começam às 09h no fuso do perfil. O intervalo de verificação é de um minuto, sem garantia de entrega pontual do sistema operacional. Despesas e metas consideram vencidos e prazos até sete dias. Lembretes duplicados são ignorados. Uma nova inscrição recebe apenas notificações criadas depois dela, evitando despejar o histórico antigo. O teste pode ser solicitado uma vez por minuto.

O push usa texto genérico. Para ver detalhes, abra o app e entre na conta. As notificações internas também são atualizadas a cada minuto enquanto a página está visível.

## Conta e segurança

- **Alterar senha** pede a senha atual, nova senha e confirmação. A senha deve ter pelo menos 12 caracteres. Outras sessões são revogadas após a alteração; tokens já emitidos podem durar até expirar.
- **Configurar duas etapas** mostra QR e chave manual para seu autenticador. A proteção só é ativada depois de confirmar um código válido.
- Ao entrar com duas etapas ativas, o app pede o código em `/auth/mfa`. O banco e o Storage também exigem AAL2, impedindo contornar o segundo fator por chamadas diretas.
- **Desativar** pede outro código válido. Guarde a chave do autenticador com segurança: sem ela ou o dispositivo, a recuperação exige acesso administrativo ao Supabase. A senha mestra do Cofre continua independente.

## Manutenção técnica

O runtime está no segredo Vault `level01_push_runtime`; apenas a chave pública fica em `push_public_config`. Não inclua a chave privada nem o token interno em `NEXT_PUBLIC_*`. Inscrições e entregas não entram em backups portáveis, pois pertencem ao navegador; a exclusão de dados da conta as remove.

Depois de alterar a lógica compartilhada de lembretes, execute `node scripts/build-reminders.mjs` e publique a pasta `supabase/functions/level01-reminders` (incluindo `jobs.js` e `deno.json`). A função usa autenticação própria com token aleatório guardado no Vault e, por isso, `verify_jwt=false`; jamais remova a checagem desse token. Em outra instalação, provisione um novo runtime VAPID/token, ajuste o URL do projeto em `private.run_reminder_tick()` e preencha a configuração pública.

Consulte execuções em `cron.job_run_details`, respostas HTTP em `net._http_response` e estados de entrega em `push_deliveries`. Não copie endpoints ou chaves para logs. Falhas transitórias têm até cinco tentativas e HTTP 404/410 remove inscrições vencidas.
