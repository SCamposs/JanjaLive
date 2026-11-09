# JanjaLive: teste privado na Microsoft Store

## Estado e canais

Preparação local, sem submissão, alteração de conta, DNS, backend ou publicação.
O instalador NSIS/EXE e o workflow de release pelo GitHub permanecem disponíveis.
A edição AppX usa o mesmo Electron, renderer, WebRTC, autenticação e auxiliar
nativo de áudio. Não converte o aplicativo em PWA, UWP ou AppContainer.

AppX é o formato suportado pelo electron-builder 26.15.3 instalado e aceito pela
Store. Não é necessário atualizar para a versão experimental do empacotador.
A Store assina o pacote após a certificação; isso não assina o EXE do GitHub.

## O que fazer na conta Microsoft, em ordem

1. Entre em https://storedeveloper.microsoft.com/ com sua conta Microsoft.
   Escolha cadastro individual, complete a verificação de identidade e ative
   MFA/passkey. O cadastro individual atual é gratuito; não contrate certificados
   nem serviços Azure pagos para esse fluxo.
2. No Partner Center, Apps and games / Windows apps, crie um novo produto e
   reserve `JanjaLive` (ou um nome disponível). Escolha aplicativo empacotado
   MSIX/AppX, não a opção de enviar uma URL de instalador EXE/MSI.
3. Em Product management → Product identity, copie exatamente:
   - Package/Identity/Name → `STORE_IDENTITY_NAME`
   - Package/Identity/Publisher → `STORE_PUBLISHER` (incluindo `CN=`)
   - Package/Properties/PublisherDisplayName → `STORE_PUBLISHER_DISPLAY_NAME`
   Esses valores são públicos, não senhas. Não invente um Publisher.
4. Crie a primeira submissão. Em Pricing and availability → Visibility →
   Audience, selecione **Private audience**, crie um known user group com seu
   e-mail e os e-mails das contas Microsoft pessoais dos amigos. Eles precisam
   entrar na Store com essas mesmas contas; contas profissionais/escolares não
   servem para adquirir o aplicativo privado.
5. Deixe **Make this product public on** desmarcado, sem data de abertura pública.
   Defina preço Free. Não substitua Private audience por Public + Direct link
   only: quem obtém um link público pode instalar. Uma submissão pública não pode
   ser convertida depois para Private audience nessa mesma ficha.
6. Gere o pacote final com a identidade acima e envie o `.appx` de `dist/store` na
   seção Packages. Nunca envie o pacote `PREVIEW`, nem `win-unpacked` ou nosso EXE.
7. Complete classificação etária, descrição, capturas de tela reais e contatos
   exigidos. Use `https://janja.live/privacidade` como política de privacidade,
   verificando antes que está acessível. Um contato público de suporte válido
   ainda precisa ser providenciado; não invente um endereço que não recebe e-mail.
8. Em notas para certificação, explique o login externo pelo Discord, como obter
   acesso para testar, e o uso de `runFullTrust`: Electron e auxiliar WASAPI para
   capturar áudio de aplicação/tela após seleção explícita. Não há elevação,
   serviço residente, driver, gravação automática ou coleta de microfone/câmera.
   Se pedirem credenciais de teste, forneça acesso dedicado pelo canal privado
   do Partner Center, nunca senha pessoal ou segredo de produção.
9. Antes de enviar, confira novamente **Private audience**, grupo correto e
   ausência de data para tornar público. A revisão costuma levar 1–3 dias úteis,
   mas pode exigir correções. Depois envie aos amigos o link privado autenticado
   indicado pelo Partner Center, não um link público de aquisição.

## Gerar e verificar sem publicar

Na raiz do repositório, em PowerShell, configure os valores públicos copiados
do Partner Center no ambiente da sessão:

```powershell
$env:STORE_IDENTITY_NAME = 'SCamposs.JanjaLive'
$env:STORE_PUBLISHER = 'CN=A672FA79-568E-4AD7-991F-61178A793318'
$env:STORE_PUBLISHER_DISPLAY_NAME = 'SCamposs'
pnpm.cmd desktop:package:store
```

Saída: `apps/desktop/dist/store/JanjaLive-Store-0.1.29-x64.appx`.
Identidade pública acima fornecida pelo proprietário no Partner Center.
O comando não publica e não registra o pacote no Windows. O pacote sem assinatura
é para submissão à Store, não para instalação direta nos computadores dos amigos.
Os assets são derivados do ícone existente; não se usa o ícone de exemplo do SDK.

```powershell
powershell -NoProfile -File apps/desktop/scripts/verify-store.ps1 -PackagePath apps/desktop/dist/store/JanjaLive-Store-0.1.29-x64.appx
```

Sem identidade reservada, `pnpm.cmd desktop:package:store:preview` verifica apenas
se o empacotamento funciona, com identidade explicitamente fictícia. Sua saída
fica em `dist/store-preview`, separada tanto do final como do EXE existente.

Validação local de 01/11/2026: build desktop e TypeScript passaram, 29 testes do
desktop passaram, ESLint nos arquivos alterados passou; pacote AppX x64 gerado e
inspecionado, 9 fuses e 1.033 entradas ASAR/auxiliar nativo verificados. Smoke do
executável desse pacote montou o renderer e preload. Não houve instalação AppX,
certificação, assinatura Microsoft ou teste real de transmissão nessa edição.
Após receber a identidade real, o pacote final 0.1.29.0 também foi gerado e passou
pelas mesmas verificações estruturais e smoke do executável, sem ser publicado.

## Atualizações posteriores

Consulte [microsoft-store-updates.md](microsoft-store-updates.md) para geração, envio manual e Actions sob demanda. A primeira publicação continua manual; o envio por API é opcional e exige configuração no Partner Center/Entra e GitHub. Não reconfigure a audiência atual para atualizar o pacote. As instruções de audiência privada acima registram a preparação original.

## Compatibilidade e aceitação obrigatória

O EXE continua usando NSIS/electron-updater/GitHub. Quando `process.windowsStore`
é verdadeiro, o aplicativo não consulta nem instala atualizações do GitHub; a
Store atualiza o pacote. Se o backend exigir versão nova, o botão abre as
atualizações da Store. O protocolo `janjalive` é registrado pelo manifesto, sem
reescrever o handler do sistema na inicialização.

Não é possível garantir áudio, captura e OAuth antes do teste com o pacote
efetivamente instalado pela Store. A verificação estrutural e o smoke do
executável não substituem esse teste. Valide:

- Instalar pela Store privada; abrir e logar pelo Discord com retorno ao app.
- Criar/entrar em sala, assistir web → Store e Store → web com áudio.
- Capturar monitor e aplicativo com/sem áudio, trocar fonte e encerrar.
- Ajustar imagem, volume, PiP e fullscreen; sair/entrar novamente.
- Fechar/reabrir, atualizar pela Store e conferir versão e sessão.
- Confirmar que uma conta Microsoft fora do grupo não consegue adquirir a ficha.

Teste primeiro em outro usuário Windows ou PC, mantendo o EXE como fallback.
Instalações lado a lado podem disputar o protocolo `janjalive`; o Windows pode
pedir qual aplicativo deve abri-lo. Não migre/apague tokens nem perfis de forma
automática. O pacote pode ter armazenamento isolado e exigir novo login. Se ambas
as edições estiverem abertas, encerre uma antes de testar login/convites.

## Distribuição privada não é teto de gastos

Private audience restringe aquisição pela Store aos membros do grupo, mesmo que
o link vaze. Não restringe o site público, o EXE existente, cadastros orgânicos
ou tráfego hostil no backend. Não funciona como allowlist de usuários Discord.

Publicar esse pacote não adiciona serviço Cloudflare nem tráfego periódico.
O custo depende do uso. Workers/Durable Objects no Free recusam operações quando
as respectivas cotas se esgotam, em vez de vender excedente automaticamente.
Confirme o plano contratado em Billing; não habilite Workers Paid para publicar.

TURN tem cobrança separada: os primeiros 1.000 GB/mês de saída compartilhados
com SFU são gratuitos, depois US$0,05/GB. Não presuma que Workers Free cria um
bloqueio de gasto para TURN. Na documentação consultada não se confirmou um teto
global rígido de bytes no app. Alarmes e limite de emissão de credenciais não
são teto de tráfego. Exemplo estimado: 10 Mbps por espectador em relay consomem
aproximadamente 4,5 GB/h, fora overhead; três espectadores por três horas/dia
durante 30 dias chegam a 1.215 GB se tudo usar relay. Conexão P2P direta não usa
esse tráfego de TURN.

Mantenha grupo pequeno e revise uso em Realtime → Analytics/Billing. A flag
`TURN_ENABLED=false` do incremento de segurança interrompe novas emissões após
deploy, mas pode impedir conexões em redes restritivas e não encerra credenciais
já emitidas. Os controles locais de segurança precisam ser implantados antes
de serem considerados proteção de produção. Ver `security-operations.md`.

## Referências verificadas

- https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/visibility-options
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- https://storedeveloper.microsoft.com/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/realtime/sfu/platform/pricing/
