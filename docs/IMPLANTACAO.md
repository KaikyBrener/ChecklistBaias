# Roteiro de implantação

Passo a passo para colocar o Checklist de baias no ar com dados reais. Do início ao fim leva cerca de uma hora. Marque cada item ao concluir.

## 0. Antes de começar (decisões)

- [ ] **Onde vai rodar:** um servidor (ou máquina que fique ligada 24 h) **dentro da rede da empresa**, com Docker e Docker Compose. Nada de hospedagem pública gratuita: são dados da operação.
- [ ] **Quem acessa de fora da rede** (se alguém): só por VPN. A porta do sistema não deve ser aberta para a internet.
- [ ] **Endereço:** um IP fixo para o servidor e, se possível, um nome no DNS interno (ex.: `checklist.empresa.local`).
- [ ] **HTTP ou HTTPS:** HTTPS é o recomendado (passo 2B). HTTP puro só é aceitável em rede interna confiável, porque a sessão trafega sem criptografia.
- [ ] **Destino do backup:** uma pasta fora do servidor (compartilhamento de rede, NAS, disco externo).

## 1. Baixar e configurar

```bash
git clone https://github.com/KaikyBrener/ChecklistBaias.git /opt/checklist-baias
cd /opt/checklist-baias
cp .env.example .env
```

No `.env`, confira os horários dos turnos (`TURNO_DIA_HORA`, `TURNO_NOITE_HORA`) e o prazo do checklist (`PRAZO_CHECKLIST_MIN`). O resto pode ficar como está.

## 2. Subir

### 2A. HTTP na rede interna (mais simples)

```bash
docker compose up -d --build
docker compose logs checklist      # a senha do primeiro admin aparece UMA vez aqui
```

Acesso: `http://IP-DO-SERVIDOR:3000`.

### 2B. HTTPS (recomendado)

No `.env`, defina o nome que as pessoas vão digitar: `DOMINIO=checklist.empresa.local` (ou o IP do servidor).

```bash
export COMPOSE_FILE=docker-compose.https.yml     # vale para os comandos seguintes desta sessão
docker compose up -d --build
docker compose logs checklist      # a senha do primeiro admin aparece UMA vez aqui
```

Acesso: `https://checklist.empresa.local`. O proxy (Caddy) emite um certificado próprio, então o navegador avisa que não o conhece até a raiz ser instalada nas máquinas:

```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./checklist-raiz.crt
```

Instale `checklist-raiz.crt` como "Autoridade de certificação raiz confiável" nos computadores que usam o sistema (no Windows: duplo clique → Instalar certificado → Máquina local → Autoridades de Certificação Raiz Confiáveis; em domínio, distribua por GPO). Se a empresa já tem certificado para esse nome, use-o no lugar: instruções no topo de `deploy/Caddyfile`.

## 3. Primeiro acesso

- [ ] Entre como `admin` com a senha que apareceu nos logs.
- [ ] Clique no seu nome (canto inferior esquerdo; no celular, o círculo com a inicial) e **troque a senha**.
- [ ] Em **Cadastro**, crie `Central 1` e `Central 2` e adicione as baias de cada uma (1 a 15).
- [ ] Em **Baias e equipamentos**, ajuste o que for diferente do padrão: desative o que a baia não tem (ex.: segundo monitor), renomeie, adicione o que faltar.
- [ ] Crie os usuários: coordenadores de cada turno, TI e gerente. Combine a senha inicial e peça para cada um trocar a sua no primeiro acesso (clicando no próprio nome).

## 4. Backup

```bash
deploy/backup.sh /mnt/backup/checklist      # teste manual: deve terminar com "backup copiado para ..."
```

Agende no cron do servidor (`crontab -e`), todo dia de madrugada:

```
15 3 * * * cd /opt/checklist-baias && deploy/backup.sh /mnt/backup/checklist >> /var/log/checklist-backup.log 2>&1
```

Com HTTPS, acrescente `COMPOSE_FILE=docker-compose.https.yml` antes de `deploy/backup.sh` na linha do cron.

- [ ] O destino fica fora do servidor e só a TI tem acesso (o arquivo contém todos os dados e os hashes de senha).
- [ ] **Teste de restauração feito uma vez:** `docker compose down`, copie um backup por cima do banco e suba de novo:

```bash
docker compose down
docker compose run --rm --no-deps -v /mnt/backup/checklist:/restaurar:ro checklist \
  sh -c 'rm -f /data/checklist.db-wal /data/checklist.db-shm && cp /restaurar/checklist-AAAAMMDD-HHMM.db /data/checklist.db'
docker compose up -d
```

## 5. Piloto (um turno de verdade)

Antes de anunciar para todos, faça um turno acompanhado com um coordenador:

- [ ] O coordenador entra pelo aparelho que vai usar no dia a dia (computador da central ou celular) e faz o checklist completo de uma central.
- [ ] Quanto tempo levou? O botão "Tudo funcionando" por baia deve deixar o checklist de 15 baias em poucos minutos.
- [ ] Registre um defeito de teste, veja-o no **Painel**, mude a situação como TI até "Resolvida" e confira o histórico.
- [ ] No turno seguinte, confirme que o defeito ainda aberto aparece como "Defeito aberto há X" em vez de pedir um novo registro.
- [ ] O gerente abre o **Painel** e baixa o CSV.
- [ ] Anote o que atrapalhou (nomes de equipamentos, baias que não existem, horário do turno) e ajuste no Cadastro ou no `.env`.

## 6. Manutenção

- **Atualizar:** `git pull && docker compose up -d --build` (o banco fica no volume `dados` e é preservado; migrações rodam sozinhas ao iniciar).
- **Ver se está no ar:** `docker compose ps` (deve mostrar `healthy`) e `docker compose logs --tail 50 checklist`.
- **Alguém esqueceu a senha:** o administrador redefine em Cadastro → Usuários. Isso derruba as sessões abertas da pessoa.
- **Saiu da empresa:** desative o usuário (o histórico dele permanece).
- **Perdeu a senha do único admin:** restaure um backup anterior, ou pare o container e crie outro admin direto no banco com apoio de quem desenvolveu.
