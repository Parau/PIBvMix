# Diagnóstico do vMix no GitHub Pages

Esta é uma página de diagnóstico isolada para testar a API real a partir do tablet, usando a mesma origem HTTPS do PIBvMix publicado. Ela só faz leituras de `/api/`; não envia comandos que alterem Preview, Program ou overlays.

## Acesso

O endereço atual do aplicativo está no README principal. Para executar a página, ela precisa estar incluída no conteúdo publicado do GitHub Pages, no caminho:

```text
https://criatividade.digital/PIBvMix/diagnostics/vmix-auth-cors/
```

No tablet, conecte-se à mesma LAN do vMix e desligue a VPN. Abra o endereço e confira se a origem mostrada é `https://criatividade.digital`. Chrome/Edge pode pedir autorização de acesso à rede local; esse aviso não é um pedido de senha. Permita-o para continuar e anote se ele apareceu.

## Execução e leitura

1. Digite a senha do Web Controller no campo protegido. Não a envie por mensagem nem copie cabeçalhos Authorization.
2. A página faz quatro leituras: sem credenciais, com a senha informada, com uma senha derivada incorreta e uma segunda leitura autenticada. A senha não vai para URL, armazenamento local, servidor do Pages ou resultados.
3. Leia a conclusão exibida pela página.

O teste é útil no tablet sem DevTools porque compara chamadas ao mesmo endereço, feitas na mesma rede e pela mesma página. Se a leitura simples retorna HTTP e todas as leituras com `Authorization` dão `TypeError`, a rede local já foi confirmada pela primeira leitura. `Authorization` é a única diferença relevante e exige um preflight CORS: para o PIBvMix, o resultado prático é que Basic Auth não pode ser usado browser-side nessa configuração. A página não tenta abrir `/api/` como navegação direta, pois isso não testa CORS.

## Estado das configurações vMix

Anote manualmente o estado de **Enable enhanced security on Web and TCP API** no vMix. Este teste não a altera. `Restrict access to LAN only` deve permitir um tablet na mesma LAN; VPN, isolamento de clientes Wi-Fi ou firewall ainda podem impedir a conexão.
