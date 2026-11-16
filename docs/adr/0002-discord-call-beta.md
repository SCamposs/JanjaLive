# ADR 0002 — Beta de salas de call do Discord

Data: 16/11/2026. Estado: implementada para beta restrita; validação integrada privada pendente. A sequência de ativação e rollback está no roteiro de operações.

## Decisão e escopo

Integração opcional, desligada por padrão e limitada ao servidor `1156443434362617927`. Reutiliza Vercel, PostgreSQL e Cloudflare existentes. Não adiciona dependências npm, serviços pagos, bot com Gateway permanente, transporte de mídia ou alterações na captura/codificação.

O fluxo atual de salas comuns continua disponível e mantém o contrato das APIs consumidas por web e desktop. A integração usa salas específicas com prazo máximo de seis horas. O prazo é verificado no backend e assinado na credencial de tempo real; um alarme único do Durable Object encerra as conexões ao expirar. Salas comuns não recebem esse campo nem agendam esse alarme.

Esta primeira versão usa um cartão estável de **Sala da call → Entrar**. Não anuncia automaticamente quem está transmitindo nem conta espectadores no Discord. As transmissões continuam visíveis na interface existente do JanjaLive. Isso evita polling e dependência do bot no caminho da mídia.

## Fluxo

1. `/janja` no servidor autorizado recebe resposta privada adiada, antes de consultas externas. A assinatura Ed25519 valida corpo original e timestamp.
2. Consulta REST identifica a call real do autor, independentemente do canal onde enviou o comando. Apenas canal de voz comum do servidor beta é aceito.
3. Um registro temporário de preparação, deduplicado por ID da interação, gera um link de continuação. Expira em 15 minutos e pertence à identidade Discord do autor.
4. O login existente preserva esse destino. Uma conta diferente ou banida não pode usar a preparação. A ação **Continuar** é explícita e tem estado de carregamento.
5. O servidor verifica novamente a call e cria ou reutiliza atomicamente uma sessão ativa para servidor/canal. Não consome uma nova criação quando reutiliza.
6. Uma mensagem normal do bot contém o cartão compartilhado. A página de entrada oferece **Abrir no aplicativo** e **Continuar no navegador**, sem tentar abrir ou instalar o desktop automaticamente.
7. Ao abrir a sala por código, convite ou ID público, o backend verifica a presença da identidade autenticada na call antes de admitir. As rotas de tempo real continuam exigindo uma associação autorizada.
8. Seleção de tela e início de transmissão permanecem nas interfaces existentes.

## Política de acesso

- A autorização vale apenas para a sessão daquela sala. Uma nova sessão cria outro ID de sala e não herda membros da antiga.
- A presença no Discord é verificada em cada entrada por ID público/convite. Consultas da sala já aberta e renovação de acesso de tempo real não consultam o Discord continuamente.
- Sair da call do Discord não expulsa automaticamente uma sessão já autorizada. Sair da tela da sala também não revoga a associação existente; esse é o comportamento atual do JanjaLive, mantido nesta beta. Uma nova abertura pelo fluxo de convite verifica a call novamente.
- Dentro da sessão ativa, a associação autorizada continua sendo a credencial de acesso às APIs; não se trata de controle contínuo de presença no Discord.
- Revogações impedem readmissão automática. O dono pode restaurar explicitamente o acesso, mas essa aprovação em sala de call também verifica a presença do destinatário.
- O modo normal de pedir aprovação não serve como alternativa para entrar em uma sala de call.
- Banimentos continuam sendo verificados pela autenticação e pela ativação de membros. Os limites existentes de 5 salas próprias ativas, 20 criações em 24 horas e 20 membros por sala permanecem.
- Links antigos não criam sessões novas. Sessões expiradas ou encerradas recusam novas entradas.

## Concorrência e publicação do cartão

A criação usa uma transação Neon com lock de servidor/canal, lock do dono e as verificações de cota existentes. Um índice único parcial impede duas salas não encerradas para o mesmo canal. A sessão expirada é encerrada antes de uma criação nova; isso não libera a cota diária já consumida.

O vínculo entre cartão e sala é persistente. Uma atualização condicional reivindica a publicação antes do POST externo, e a API do Discord recebe um nonce estável com `enforce_nonce`. Depois de um timeout ambíguo, a reivindicação permanece para evitar outra publicação fora da janela de deduplicação do Discord. Uma rejeição HTTP definitiva permite nova tentativa. Uma falha no cartão não desfaz uma sala já criada nem dispara outra criação.

Na falha ambígua, o usuário pode continuar na sala, mas a publicação pode exigir reconciliação administrativa; não há promessa de retry durável automático nesta beta. Não habilitar filas/planos pagos para contornar isso.

A UI distingue publicação reconhecida, confirmação pendente e rejeição confirmada. Quando outra requisição já reivindicou a publicação, o backend relê o registro antes de responder. Um POST reconhecido pelo Discord continua sendo sucesso mesmo se salvar o recibo falhar; somente essa gravação idempotente é repetida uma vez. A ação manual Verificar convite consulta até 100 mensagens recentes, considera somente cartões do próprio bot com a URL exata da sessão e recupera o recibo encontrado. Não há monitoramento de conversas ou gravação de seu conteúdo. Essa recuperação depende de Ler histórico de mensagens no canal; sem acesso ou sem encontrar o cartão nesse limite, permanece pendente e não republica às cegas. Os logs registram a etapa da falha sem payloads ou credenciais.

As telas de escolha de cliente incluem um link manual e sublinhado para a Microsoft Store, abaixo dos botões. Abrir o aplicativo não baixa instalador nem dispara redirecionamento temporizado quando o protocolo não existe.

Encerramento/exclusão primeiro aplica a autorização e notifica os participantes pelo mecanismo atual. A atualização visual do cartão é best effort em `after()`, sem atrasar a resposta nem impedir o encerramento. Expiração automática bloqueia o link e encerra conexões, mas não modifica o cartão no Discord; a página informa que a sessão terminou.

## Isolamento e custo

`DISCORD_CALLS_ENABLED` ausente ou diferente de `true` desativa os endpoints e esconde salas de call da listagem. O ID configurado precisa corresponder ao servidor beta fixado no código. A integração exige o provedor Cloudflare já configurado; não usa Upstash como fallback.

Não existe job por segundo, enumeração contínua de membros, monitoramento de mensagens ou bot ouvindo a call. Limites adicionais: 5 comandos/minuto por pessoa, 30 comandos/10 minutos para o servidor e 5 preparações de sala/minuto por conta. O alarme de prazo é pontual, não periódico.

Custo adicional zero significa operar dentro da folga dos planos gratuitos existentes, sem contratar ou habilitar serviços pagos. Requisições REST, consultas ao banco e operações Cloudflare ainda consomem cotas compartilhadas. Não é garantia de consumo zero ou gratuidade ilimitada.

## Privacidade

Não alterar os scopes `identify` do login atual nem guardar tokens OAuth adicionais dos usuários. Token do bot e credenciais de interação ficam no servidor. Logs não imprimem tokens, payloads completos ou erros externos crus.

São armazenados IDs da interação, conta Discord, servidor, canal, preparação, sala e mensagem. Não são armazenados áudio da call, mute/deaf, dispositivos ou o `session_id` individual de voz. Preparações vencidas são removidas nos comandos seguintes; as salas seguem a manutenção existente. Desativação prolongada requer limpeza administrativa dos registros de preparação, sem prometer exclusão física no instante da expiração.

Rotas de preparação/entrada não são indexáveis; seus identificadores são ocultados no Analytics. Textos de privacidade e termos exibem uma seção específica somente quando a beta está habilitada.

## Validação local

- Prova Discord real: identificação da call, publicação, verificação na call correta, recusa em outra call/fora da voz, negação/restauração de Connect e Send Messages, edição do mesmo cartão após aproximadamente 22 minutos e encerramento visual confirmado pelo usuário.
- PostgreSQL descartável local: concorrência entre donos, uma sala/uma criação consumida, reutilização sem cota de criação disponível, expiração sem ressurreição, limites normais e diários, revogação, conta banida, admissão sem aprovação de participante verificado e recusa de usuário sem concessão. A API de presença do Discord é simulada nesses testes SQL.
- Testes de API: flag/servidor, assinatura real Ed25519, PING, ACK antes do trabalho externo, identidade da preparação, falhas externas, sem eco de segredos.
- Login: retorno seguro para os novos caminhos e preservação dos convites comuns. Isso não equivale a testar uma nova rodada OAuth real.
- Tempo real: prazo assinado, rejeição de prazo vencido/excessivo, remoção de header forjado, encerramento de sockets pelo alarme e ausência de efeito em salas comuns.
- UI: envio bloqueado durante preparação, destinos explícitos; inspeção visual de uma fixture dos componentes reais com CSS compilado em larguras de desktop e celular. A fixture não executa OAuth ou uma transmissão.
- Build de produção da web, build do desktop, typechecks, ESLint e empacotamento seco do Worker. Nenhum executável/instalador foi publicado.

Os resultados e comandos finais ficam no roteiro de ativação abaixo. Não interpretar compilação e testes controlados como prova de login externo, descoberta do aplicativo instalado, latência de cold start hospedado ou qualidade de mídia numa nova sessão real.

## Antes de ativar ou publicar a beta

Seguir `docs/operations/discord-call-beta.md`. Validar em uma sessão real o login/retorno, abertura do desktop, entrada de outro participante autorizado e revogação durante uso. A instrumentação local e a prova do Discord estão aprovadas; essa etapa externa ainda não foi executada com o código integrado.
