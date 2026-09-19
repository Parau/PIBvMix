# Diagnóstico do vMix no GitHub Pages

Esta é uma página de diagnóstico isolada para testar a API real a partir do tablet, usando a mesma origem HTTPS do PIBvMix publicado. Ela só faz leituras de `/api/`; não envia comandos que alterem Preview, Program ou overlays.

## Acesso

O endereço atual do aplicativo está no README principal. Para executar a página, ela precisa estar incluída no conteúdo publicado do GitHub Pages, no caminho:

```text
https://criatividade.digital/PIBvMix/diagnostics/vmix-auth-cors/
```

No tablet, conecte-se à mesma LAN do vMix e desligue a VPN. Abra o endereço e confira se a origem mostrada é `https://criatividade.digital`. Chrome/Edge pode pedir autorização de acesso à rede local; esse aviso não é um pedido de senha. Permita-o para continuar e anote se ele apareceu.

## Execução e leitura

1. Abra DevTools → Network antes de tocar em **Executar bateria única**. Filtre por `192.168.25.2` e, se disponível, ative **Preserve log**.
2. Digite a senha do Web Controller no campo protegido. Não a envie por mensagem nem copie cabeçalhos Authorization.
3. A página faz quatro leituras: sem credenciais, com a senha informada, com uma senha derivada incorreta e uma segunda leitura autenticada. A senha não vai para URL, armazenamento local, servidor do Pages ou resultados.
4. Registre a ordem e status de OPTIONS/GET, além de `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` e `WWW-Authenticate` no Network. Não exporte HAR.
5. Feche a página quando terminar.

Um `TypeError` no JavaScript sozinho não distingue CORS de bloqueio de rede local/conteúdo misto. Use Network/Console: se o navegador mostrar que a permissão local ou conteúdo misto bloqueou a chamada e não houver OPTIONS, a API não foi testada. Se OPTIONS chegar ao vMix e faltar permissão para `Authorization`, o navegador deve bloquear antes do GET autenticado. Com preflight aprovado, senha correta e incorreta distinguem sucesso HTTP de `401`.

## Estado das configurações vMix

Anote manualmente o estado de **Enable enhanced security on Web and TCP API** no vMix. Este teste não a altera. `Restrict access to LAN only` deve permitir um tablet na mesma LAN; VPN, isolamento de clientes Wi-Fi ou firewall ainda podem impedir a conexão.
