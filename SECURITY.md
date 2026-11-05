# Segurança

## O que o sistema já faz

- Senhas guardadas com **scrypt** (sal aleatório); a comparação usa tempo constante e há um hash falso para igualar o tempo quando o usuário não existe.
- Sessão em cookie `HttpOnly` + `SameSite=Strict` (JWT assinado, 12 h). A conta é conferida no banco a **cada requisição**, então desativar um usuário vale na hora.
- Proteção contra CSRF: toda escrita exige o cabeçalho `X-Requested-With: checklist-baias`.
- Limite de tentativas de login por IP + usuário (em memória).
- Cabeçalhos: CSP restritiva (`default-src 'self'`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; respostas da API com `Cache-Control: no-store`.
- Entradas validadas com `zod`; SQL sempre parametrizado; exportação CSV protegida contra injeção de fórmulas.
- Histórico de ocorrências **somente de acréscimo** (triggers do banco bloqueiam UPDATE/DELETE).
- Imagem Docker roda como usuário sem privilégios (`node`).

## Antes de colocar em produção

- [ ] Rodar com `NODE_ENV=production` (a imagem Docker já faz isso). Assim a senha padrão `admin` **não** é criada e o primeiro admin recebe uma senha aleatória (ou a de `ADMIN_SENHA`). Troque-a no primeiro acesso.
- [ ] Servir por **HTTPS** (proxy reverso) e definir `COOKIE_SECURE=1` e `TRUST_PROXY=1`. Sem HTTPS o cookie de sessão trafega em texto puro.
- [ ] Manter o sistema na rede interna/VPN; não expor a porta 3000 diretamente na internet.
- [ ] Definir `JWT_SECRET` (32+ caracteres) ou proteger o volume `/data`, onde fica o arquivo `segredo-sessao`.
- [ ] Nunca usar `DEMO=1` com dados reais (a tela pública mostra a senha de demonstração).
- [ ] Agendar o backup (`node dist/backup.js`) e copiar para fora do servidor; proteger os arquivos de backup (contêm todos os dados e os hashes de senha).
- [ ] Manter as dependências atualizadas (o repositório tem Dependabot e `npm audit` no CI).

## Limitações conhecidas

- O encerramento de sessão (sair) apaga o cookie no navegador, mas o token continua válido até expirar (12 h); desativar o usuário o invalida de imediato.
- Redefinir a senha de um usuário não derruba sessões já abertas dele (desative e reative, ou aguarde expirar).
- O limite de tentativas de login fica em memória: reiniciar o servidor zera a contagem, e vale por processo.
- Não há autenticação em dois fatores nem recuperação de senha por e-mail.

## Como relatar uma vulnerabilidade

Não abra uma issue pública. Use o recurso **Security → Report a vulnerability** do GitHub deste repositório (ou contate o mantenedor em privado) com os passos para reproduzir. Responderemos assim que possível.
