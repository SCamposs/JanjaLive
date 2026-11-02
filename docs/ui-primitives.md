# Primitivos da interface

Web e desktop compartilham `@janjalive/ui`, baseado em `@base-ui/react` com versão fixada no lockfile. A biblioteca fornece comportamento; cores, fontes e estilos continuam sendo do JanjaLive.

Nesta primeira etapa foram migrados o menu da conta, os tooltips de botões e os campos de busca e ordenação do admin. Os diálogos, sliders e demais formulários continuam com suas implementações atuais.

## Uso

- `InteractionProvider` fica na raiz de cada interface. Compartilha o atraso dos tooltips e acompanha a camada de fullscreen com um único listener.
- `TooltipButton` preserva um botão real, suas classes, ref e eventos. Não acrescenta um elemento sobre a área clicável. Use um `aria-label` descritivo nos botões com ícone.
- `AppSelect` recebe opções e valor controlado. A seleção mantém o foco e a navegação por teclado da biblioteca.
- `TextInput` expõe o primitivo Input do Base UI, com suporte a atributos nativos e `onValueChange`.
- O menu da conta usa os componentes `Menu`. A confirmação para encerrar todas as sessões mantém `closeOnClick={false}` e é reiniciada quando o menu fecha.
- Importar `@janjalive/ui/styles.css` depois da folha principal da aplicação. Os estilos usam os tokens existentes e valores equivalentes no desktop.

Tooltips e selects usam portais para evitar recorte por `overflow`. Quando há um elemento em fullscreen, seus portais são montados dentro dele. Transições respeitam `prefers-reduced-motion`.

Não substituir controles nativos simples sem benefício concreto. Alterações na interface não devem alterar captura, áudio, sinalização ou permissões das salas.

## Validação

Os testes cobrem confirmação de logout, bloqueio durante compartilhamento, Escape/foco, fechamento externo, seleção, busca/paginação, encaminhamento de toque e destino do portal em fullscreen. A conferência visual usa os componentes reais e as folhas de estilo web/desktop em uma página local de teste, sem acessar contas ou serviços de produção.
