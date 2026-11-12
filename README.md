# Checklist de baias

Sistema para registrar, a cada troca de turno, o estado dos equipamentos de cada baia das centrais de monitoramento, e transformar isso em histórico, acompanhamento do conserto e indicadores para a gestão.

**O problema que resolve:** equipamento quebrado só aparece quando alguém reclama, não há registro de quando começou, quanto tempo ficou parado nem se quebra sempre no mesmo lugar. Aqui, cada defeito vira uma ocorrência com data, hora, autor e histórico, do aviso até o conserto.

## Como funciona

- **Estrutura:** Central → Baia (1 a 15) → Equipamentos (monitores, computador, headset, teclado e mouse, telefone, nobreak). Tudo editável no cadastro.
- **Turnos:** dia (07h–19h) e noite (19h–07h). A madrugada pertence ao turno da noite que começou na véspera. Horários configuráveis.
- **Checklist:** um por central e por turno. O coordenador confere baia por baia (botão "Tudo funcionando" para agilizar; defeito pede só estado e uma observação). Só conclui quando todos os equipamentos foram conferidos.
- **Ocorrência:** o defeito só é aberto uma vez por equipamento. No turno seguinte o checklist mostra "Defeito aberto há X" e pergunta se continua ou voltou a funcionar; nada de lançar o mesmo problema várias vezes.
- **TI:** muda a situação (aberta → em manutenção → aguardando peça → resolvida) com anotação. Todo o histórico é **somente de acréscimo**: o banco impede alterar ou apagar eventos.
- **Painel:** defeitos abertos agora, mapa das baias, tempo médio de conserto, o que mais quebra, baias problemáticas, equipamentos reincidentes, e se o checklist está sendo feito no prazo. Exporta CSV (abre direto no Excel).

| Perfil | Pode |
|---|---|
| Coordenador | fazer o checklist, ver painel e ocorrências, anotar |
| TI | tudo de leitura, mudar situação das ocorrências, baixar CSV |
| Gerente | ver painel e ocorrências, baixar CSV |
| Administrador | tudo, mais cadastro de centrais, baias, equipamentos e usuários |

Cada pessoa troca a própria senha clicando no seu nome (no celular, no círculo com a inicial).

## Testar agora (dados fictícios)

```bash
cd server && npm ci && cd ../web && npm ci && npm run build && cd ../server
DEMO=1 npx tsx src/index.ts        # http://localhost:3000
```

A tela de login mostra os perfis de demonstração (senha `demo12345`). Os 30 dias de histórico são gerados pelas mesmas regras do sistema, então os gráficos mostram o que o uso real mostraria. **Nunca use `DEMO=1` com dados reais:** ele só funciona com banco vazio, justamente para isso.

## Instalar na rede interna (dados reais)

Recomendado: servidor da empresa dentro da rede interna (ou VPN), nunca hospedagem pública gratuita. O passo a passo completo, com HTTPS, backup agendado e o piloto com o coordenador, está em **[docs/IMPLANTACAO.md](docs/IMPLANTACAO.md)**. Resumo:

```bash
cp .env.example .env               # ajuste turnos e prazo se precisar
docker compose up -d --build
docker compose logs checklist      # a senha do primeiro admin aparece UMA vez aqui
```

Acesse `http://IP-DO-SERVIDOR:3000`, entre como `admin` com a senha dos logs (em produção ela é sempre aleatória, ou a que você definir em `ADMIN_SENHA`), **troque a senha** (clique no seu nome), cadastre as centrais/baias e crie os usuários.

Para HTTPS, use o compose que já traz o proxy (Caddy) configurado: defina `DOMINIO` no `.env` e rode `docker compose -f docker-compose.https.yml up -d --build`. Ele liga `COOKIE_SECURE` e `TRUST_PROXY` e não publica a porta 3000.

### Backup

O banco é um único arquivo SQLite no volume `dados`. Backup consistente, sem parar o sistema:

```bash
docker compose exec checklist node dist/backup.js
```

Por padrão mantém as 14 cópias mais recentes dentro do volume (`BACKUP_MANTER`). Para gerar a cópia **e trazê-la para uma pasta fora do volume** em um comando só, use `deploy/backup.sh /pasta/de/destino` e agende-o no cron do servidor (a linha pronta está no próprio script). Para restaurar: pare o container e troque `checklist.db` pelo backup (comandos em [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md)).

## Configuração (variáveis de ambiente)

`PORT`, `DB_PATH`, `TZ_OPERACAO`, `TURNO_DIA_HORA`, `TURNO_NOITE_HORA`, `PRAZO_CHECKLIST_MIN`, `ADMIN_LOGIN`, `ADMIN_SENHA`, `JWT_SECRET`, `COOKIE_SECURE`, `TRUST_PROXY`, `DOMINIO` (só no compose com HTTPS), `DEMO`. Detalhes em `.env.example`. Sem `JWT_SECRET`, o segredo da sessão é gerado uma vez e guardado ao lado do banco.

## Desenvolvimento

Em desenvolvimento (sem `NODE_ENV=production`), o primeiro start com banco vazio cria o usuário **`admin` / senha `admin`**. Isso é só para uso local: em produção esse padrão é desativado e uma senha aleatória é gerada.

```bash
cd server && npm ci && npm test          # 29 testes (regras de turno, ocorrência, permissões, sessão, cadastro, painel, CSV)
cd server && npm run dev       # API em :3000
cd web && npm ci && npm run dev   # front em :5173 com proxy para a API (API_URL muda o destino)
```

Interface: menu lateral no computador e navegação fixa embaixo no celular, tema claro/escuro (botão na barra lateral; a escolha fica salva no navegador), fontes Barlow incluídas no projeto (nada é carregado de sites externos). O guia visual de referência está em `Modelo-front/`.

Organização do front (`web/src`):

- `styles/tokens.css` — design system: cores em OKLCH (claro e escuro), escala tipográfica, espaçamento em base 4 px, raios e movimento. Cor é usada para estado (ok, atenção, parado) e ação; o resto é neutro.
- `styles/base.css`, `controles.css`, `components.css`, `shell.css` — base, controles, componentes compartilhados e estrutura; um arquivo por tela (`painel.css`, `checklist.css`, `ocorrencias.css`, `cadastro.css`).
- `components/` — peças reutilizáveis sem regra de negócio: `Icone`, `Estado` (carregando, falha com nova tentativa, vazio), `Aviso`, `Selo`, `Campo`, `Segmento`, `Pagina`, `Tema`.
- `pages/` — uma tela por arquivo (`CadastroBaias.tsx` é a parte de baias e equipamentos do Cadastro). Permissões na interface só escondem botões; quem decide é sempre o servidor.

Sem estilo inline no HTML (a CSP não permite): larguras dinâmicas são aplicadas pelo React via CSSOM, que a política aceita.

As decisões de interface seguiram, como referência e sem copiar código, as orientações de [Impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0), [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT) e das skills da Vercel [web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), [react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) e [composition-patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) (MIT).

Stack: Node 22 no desenvolvimento e 26 na imagem Docker (o CI testa as duas), Express, SQLite (better-sqlite3), zod, React + Vite + TypeScript. Gráficos em SVG puro (sem biblioteca), porque a política de segurança do servidor não permite estilo inline.

## Segurança

Senhas com scrypt; sessão em cookie `HttpOnly` + `SameSite=Strict`; proteção contra CSRF por cabeçalho próprio; limite de tentativas de login; CSP restritiva; CSV protegido contra injeção de fórmulas; a conta é revalidada a cada requisição: desativar um usuário, sair ou trocar a senha derruba as sessões na hora. Consultas SQL sempre parametrizadas.

O banco, o segredo de sessão e os backups ficam em `data/` e **não são versionados** (veja `.gitignore`). Antes de colocar em produção, leia o checklist em [SECURITY.md](SECURITY.md).

## Limites conhecidos do MVP

- Sem fotos nem anexos nas ocorrências.
- Sem avisos automáticos (e-mail/Teams) quando um equipamento para ou quando o checklist atrasa.
- Não há recuperação de senha por e-mail: o administrador redefine (cada pessoa troca a própria senha depois de entrar).
- Sair encerra a sessão em todos os aparelhos da pessoa, não só no atual.
- Não há tela para renomear ou desativar uma central (a API tem); baias e equipamentos têm.
- O compose com HTTPS (`docker-compose.https.yml`) é validado no CI só quanto à sintaxe; o certificado e o nome de rede precisam ser conferidos no servidor.
