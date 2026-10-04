# PIBvMix

Interface web para operação rápida de recursos do vMix, com foco em encontrar o próximo conteúdo e enviá-lo ao **Preview** com poucos cliques e com proteções contra ações inseguras em itens que já estão no ar.

**Versão atual do app: v0.3.7**  
Aplicação hospedada: <https://criatividade.digital/PIBvMix/>

O PIBvMix é uma aplicação estática em HTML/CSS/JavaScript. Não precisa de backend próprio para funcionar e conversa diretamente com a HTTP Web API do vMix.

## Principais funcionalidades

- modos **CONFIGURE** e **CONTROL**
- conexão direta com a HTTP Web API do vMix
- visualização de estados Program / Preview / ON AIR nos cards
- proteção contra envio de recursos que já estão ON AIR, inclusive em composições aninhadas
- suporte a Title Presets do vMix por CSV
- verificação de campos de títulos quando o mapeamento está disponível
- busca, filtros e ordenação da paleta de recursos
- preferências locais da tela Control, incluindo colunas, tamanho, quantidade de texto e modo recolhido
- persistência local em `localStorage`
- importação e exportação da configuração em JSON
- importação, no modo local, de paletas JSON salvas em `deploy/control-palette/`
- transferência óptica da configuração por QR Code
- modo Demo/Mock para testar a interface sem um vMix real
- emulador local da API do vMix para desenvolvimento
- testes automatizados de núcleo, emulador, fluxo óptico e interface

Consulte também [`SPEC.md`](./SPEC.md) e [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md).

## Formas de execução

O PIBvMix pode ser usado de duas maneiras.

### 1. Aplicação hospedada na Internet

É o modo mais simples quando o tablet/computador que opera o PIBvMix consegue acessar simultaneamente:

- a aplicação hospedada na Internet; e
- o endereço local do computador onde o vMix está rodando.

Exemplo:

```text
PIBvMix: https://criatividade.digital/PIBvMix/
vMix:    http://192.168.1.50:8088
```

Nesse modo, **o vMix não precisa ser exposto à Internet**. A página é carregada do servidor web público, mas o navegador faz as chamadas da API diretamente para o endereço privado do vMix na rede local.

Esse modo depende de o dispositivo que está executando o navegador conseguir acessar tanto a Internet quanto a rede onde está o vMix.

### 2. Servidor local via USB

Esse modo foi criado para ambientes de produção em que o computador do vMix está em uma rede isolada, restrita ou que não permite acesso externo adequado ao vMix.

O pacote em [`deploy/`](./deploy/) usa:

- **Caddy** para servir o PIBvMix localmente no computador Windows do vMix;
- **ADB** para criar um túnel USB entre o tablet Android e o computador;
- porta `4173` para a interface web;
- porta `8088` para a HTTP Web API do vMix.

O fluxo fica assim:

```text
Tablet Android
    |
    | USB / ADB reverse
    |
    +--> 127.0.0.1:4173 --> Caddy --> deploy/vmix
    |
    +--> 127.0.0.1:8088 --> vMix Web API
```

O tablet pode operar o sistema sem depender de acesso à Internet ou de acesso direto à LAN do vMix.

#### Preparar os arquivos do modo local

O código-fonte oficial continua na raiz do repositório (`index.html` e `src/`). Para atualizar a cópia usada pelo Caddy:

```bat
deploy\atualizar-vmix-local.bat
```

Esse script copia `index.html` e espelha `src/` para:

```text
deploy/vmix/
```

#### Driver USB/ADB

No Windows, alguns dispositivos Android — especialmente Samsung — podem precisar de driver USB/ADB.

Quando necessário, execute uma vez, com privilégio administrativo:

```bat
deploy\instalar-driver.bat
```

Depois da instalação do driver, o uso normal do Caddy e do ADB não deve precisar de elevação administrativa.

No Android, habilite **Opções do desenvolvedor** e **Depuração USB** e autorize o computador quando solicitado.

#### Iniciar o modo local

Execute:

```bat
deploy\iniciar-remote-vmix.bat
```

O script:

1. inicia o ADB;
2. verifica o dispositivo Android;
3. cria os túneis USB para as portas `4173` e `8088`;
4. inicia o Caddy.

No tablet, abra:

```text
http://127.0.0.1:4173
```

Na configuração do PIBvMix, use o vMix em:

```text
127.0.0.1:8088
```

#### Paletas prontas no servidor local

No modo local, o Caddy também publica a pasta:

```text
deploy/control-palette/
```

O objetivo é permitir preparar uma Control Palette no navegador do próprio computador do vMix e reutilizá-la depois no tablet sem precisar localizar manualmente o arquivo no Android.

Fluxo recomendado:

1. configure a paleta no PIBvMix;
2. use **Export** normalmente para baixar o arquivo JSON;
3. copie ou mova esse JSON para `deploy/control-palette/` e dê a ele um nome descritivo, por exemplo `culto-domingo.json`;
4. inicie o modo local com `deploy\iniciar-remote-vmix.bat`;
5. no tablet, na tela Configure, use **Server palettes**;
6. selecione o JSON desejado para importar a configuração.

O botão **Server palettes** aparece apenas quando o PIBvMix está sendo executado pelo servidor local em `127.0.0.1`/`localhost`. O Caddy disponibiliza a listagem dos arquivos dessa pasta somente para leitura; o export continua sendo o download normal do navegador.

## Requisitos do vMix

Para operação real:

- vMix Web Controller/API habilitado, normalmente na porta `8088`
- `Restrict access to LAN only`: pode permanecer habilitado
- `Enable enhanced security on Web and TCP API`: desabilitado para o acesso atual via navegador
- senha do Web Controller em branco na implementação atual

No modo hospedado na Internet, o navegador precisa de permissão para acessar a rede local. No modo local via USB, a comunicação é encaminhada pelo ADB para o próprio computador do vMix.

## Testar sem vMix

Abra a aplicação e escolha **Use Demo mode**, ou acrescente `?demo=1` à URL.

Para desenvolvimento local:

```bash
npm test
npm run emulator
npm run serve
```

O emulador usa `http://127.0.0.1:8088/api`.

## GitHub Pages / hospedagem estática

O PIBvMix não exige etapa de build. O repositório usa caminhos relativos e contém `.nojekyll`, portanto pode ser publicado diretamente em hospedagem estática, incluindo GitHub Pages.

## Checklist básico antes de um evento

1. Confirmar a conexão com o vMix e a quantidade de inputs.
2. Enviar um input inofensivo para Preview.
3. Importar e validar os Title Presets usados no evento.
4. Confirmar que recursos ON AIR são bloqueados corretamente.
5. Organizar a paleta de operação.
6. Exportar a configuração JSON como backup ou transferi-la pelo recurso óptico/QR.
7. Se estiver usando o modo local, validar previamente `ADB + Caddy + 127.0.0.1:8088` no tablet e, se necessário, a leitura de `deploy/control-palette/`.
