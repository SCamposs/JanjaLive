# Atualizações da Microsoft Store

O instalador EXE e o pacote da Store continuam em canais independentes. O EXE
usa GitHub/electron-updater; a instalação pela Store recebe atualizações pela
Microsoft. Não instalar o pacote unsigned diretamente em computadores de usuários.

## Atualização manual desta versão

1. Acesse https://partner.microsoft.com/dashboard e abra **JanjaLive**, o produto
   existente. Não crie outro produto nem reserve outro nome.
2. Na visão geral, escolha **Atualizar / Update** ou **Criar novo envio / Create
   a new submission**. Se já houver um envio em certificação, aguarde ou resolva
   esse envio antes de iniciar outro.
3. Abra **Pacotes / Packages** e envie `JanjaLive-Store-0.1.33-x64.msix`, disponível
   na release v0.1.33. O AppX equivalente também é gerado localmente; não envie os
   dois pacotes x64 com a mesma identidade/versão no mesmo envio. Não envie o EXE,
   o blockmap, latest.yml ou pacote PREVIEW à Store.
4. Confirme a versão **0.1.33.0**, arquitetura **x64** e família **Windows 10/11
   Desktop**. Não habilite Mobile, Xbox, Team ou Mixed Reality.
5. Mantenha a identidade existente:
   - Name: `SCamposs.JanjaLive`
   - Publisher: `CN=A672FA79-568E-4AD7-991F-61178A793318`
   - PublisherDisplayName: `SCamposs`
6. Em **Listagens da Store → Português (Brasil) → Novidades**, use:

   > Melhorias na segurança e no encerramento das salas e transmissões.
   > Correções no cancelamento do compartilhamento, login, solicitações de acesso
   > e convites. Controles mais consistentes e acessíveis na web e no desktop.

7. Mantenha preço gratuito, mercados, visibilidade, classificação etária,
   descrição, imagens e política de privacidade existentes. Para esta atualização
   não é necessário mudar esses campos. Se houver um novo questionário ou campo
   obrigatório da Microsoft, responda conforme o comportamento real do app.
8. Em notas para certificação, explique que o login continua externo pelo Discord
   e que captura de tela/áudio só começa após seleção explícita. Não coloque
   credenciais pessoais, tokens de produção ou secrets nesse texto.
9. Salve, revise as mensagens de validação e escolha **Enviar para certificação**.
   A publicação e a assinatura Microsoft dependem da aprovação. O envio do pacote
   não atualiza imediatamente os usuários.

Não altere a identidade, o protocolo `janjalive`, o nome público, nem os canais
de atualização para fazer uma atualização comum. A versão do pacote deve sempre
ser maior que a última aceita pela Store; o quarto componente permanece zero.
Para uma versão futura, substitua 0.1.33 pela versão da release escolhida.

## Gerar novamente sem publicar

```powershell
$env:STORE_IDENTITY_NAME = 'SCamposs.JanjaLive'
$env:STORE_PUBLISHER = 'CN=A672FA79-568E-4AD7-991F-61178A793318'
$env:STORE_PUBLISHER_DISPLAY_NAME = 'SCamposs'
pnpm.cmd desktop:package:store
```

O script gera AppX e MSIX em `apps/desktop/dist/store`, verifica identidade,
versão, capacidades, recursos, fuses e conteúdo ASAR. O Windows SDK reempacota o
MSIX; a verificação compara os arquivos descompactados, inclusive manifesto e
binários, com o AppX original. Não troca a captura nativa nem adiciona serviço,
driver, backend ou assinatura paga. O MSIX permite o envio pela CLI sem ela tentar
instalar o workspace pnpm como projeto npm.

## GitHub Actions: execução somente quando solicitada

Workflow: **Microsoft Store update (manual)**, em
`.github/workflows/store-update.yml`. Não tem gatilho push, tag ou agendamento.

Sem credenciais Microsoft:

1. Abra **GitHub → SCamposs/JanjaLive → Actions → Microsoft Store update (manual)**.
2. Clique **Run workflow**, selecione a branch **main** e informe uma release
   estável já publicada, por exemplo `v0.1.33`.
3. Deixe **submit_to_store** desmarcado. O workflow valida versão, ancestralidade
   em main, testes e pacote, e oferece o artifact MSIX para download por 14 dias.
   Depois siga o envio manual acima. Isso não altera a Store.

### Habilitar envio à Microsoft, opcional

A primeira versão precisa estar publicada e disponível na Store. Um rascunho ou
envio já existente deve ser concluído/resolvido antes do workflow; ele falha em
vez de sobrescrever esse trabalho. A conta Microsoft pessoal não basta para
autenticação de serviço.

1. **Partner Center → Configurações da conta → Tenants**: associe um tenant
   Microsoft Entra existente, ou crie um pelo fluxo disponível na sua conta.
2. Em https://entra.microsoft.com, vá a **Identity → Applications → App
   registrations → New registration**, crie uma aplicação de serviço e anote
   **Directory (tenant) ID** e **Application (client) ID**.
3. Nessa aplicação, **Certificates & secrets → Client secrets → New client
   secret**. Copie o **Value**, não o Secret ID, diretamente para o GitHub.
   Guarde a expiração e renove antes de vencer. Não cole secrets no chat ou repo.
4. No Partner Center, **Configurações da conta → Gerenciamento de usuários →
   Aplicações Microsoft Entra**, adicione a aplicação e atribua **Manager**,
   conforme o requisito atual da Microsoft. Restrinja aos recursos do JanjaLive
   quando a interface da conta permitir.
5. Em **Configurações da conta → Identificadores / Developer settings**, obtenha
   **Seller ID / Publisher ID**. Em **JanjaLive → Product identity**, obtenha o
   **Store product ID** de 12 caracteres. Não use `SCamposs.JanjaLive` nesse campo.
6. No GitHub, **Settings → Environments → New environment**, crie
   `microsoft-store`. Restrinja deploys à branch main e configure revisão manual
   se esse recurso estiver disponível no plano atual. Não é necessário contratar
   um plano pago para usar o workflow manual.
7. Dentro desse environment, adicione estes **secrets**:

   | Nome | Valor |
   |---|---|
   | `AZURE_AD_TENANT_ID` | Directory/tenant ID |
   | `AZURE_AD_APPLICATION_CLIENT_ID` | Application/client ID |
   | `AZURE_AD_APPLICATION_SECRET` | Value do client secret |
   | `SELLER_ID` | Seller/publisher ID do Partner Center |

   Adicione a **variable** `MICROSOFT_STORE_PRODUCT_ID` com o Store product ID.
   Não é preciso adicionar essas configurações à Vercel ou ao Cloudflare.
8. Execute o mesmo workflow em main e marque **submit_to_store**. Ele usa a CLI
   Microsoft fixada em v0.4.4 para enviar o MSIX preparado à certificação. Não
   altera deliberadamente mercados, visibilidade ou preço. Se a API recusar o
   preço existente ou a conta não permitir integração, use o envio manual; não
   mude o preço ou compre um serviço para contornar isso.

O job com credenciais só consome o pacote já construído e verificado; não roda
instalação de dependências do projeto. As actions e CLI têm versões fixadas.
O workflow verifica produto, primeira publicação e ausência de rascunho antes
de enviar. Após uma falha, confira o Partner Center antes de repetir, pois o
upload pode já ter criado um envio. Não misture edição manual e API no mesmo
rascunho; a Microsoft documenta limitações nesse cenário.

### Custo e limites

O fluxo não adiciona consumo à sinalização Cloudflare, à Vercel ou ao tráfego
P2P da transmissão. Runners/artefatos seguem a cota e cobrança da conta GitHub;
não há promessa de execução ilimitada gratuita para qualquer plano. Este repo
é público na data da implementação. Não criamos recursos pagos Azure/Entra,
certificados comerciais ou assinaturas. A certificação continua sob controle
da Microsoft, mesmo quando o upload é automático.

### Validação pendente de credenciais

Gerar/verificar o pacote pode ser testado sem conta Microsoft. O primeiro envio
autenticado do workflow só pode ser confirmado depois da configuração acima;
não foi considerado publicado na Store apenas por gerar o MSIX.

## Referências verificadas

- https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/github-actions
- https://learn.microsoft.com/en-us/windows/uwp/monetize/create-and-manage-submissions-using-windows-store-services
- https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/upload-app-packages
- https://github.com/microsoft/msstore-cli/blob/v0.4.4/MSStore.CLI/ProjectConfigurators/MSIXProjectPublisher.cs
