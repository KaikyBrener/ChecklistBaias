#!/bin/sh
# Backup do Checklist de baias: gera a cópia dentro do container e traz para uma pasta do servidor.
#
# Uso:    deploy/backup.sh /caminho/de/destino
# Agende no cron do servidor (exemplo: todo dia às 03:15) e aponte o destino para um local FORA
# desta máquina (pasta de rede montada, disco externo). O arquivo contém todos os dados e os
# hashes de senha: proteja a pasta de destino.
#
#   15 3 * * * cd /opt/checklist-baias && deploy/backup.sh /mnt/backup/checklist >> /var/log/checklist-backup.log 2>&1
#
# Se o sistema sobe com docker-compose.https.yml, exporte antes: COMPOSE_FILE=docker-compose.https.yml
set -eu

DESTINO="${1:?Informe a pasta de destino. Ex.: deploy/backup.sh /mnt/backup/checklist}"
MANTER="${BACKUP_MANTER_FORA:-30}"   # quantas cópias manter na pasta de destino

cd "$(dirname "$0")/.."
mkdir -p "$DESTINO"

# 1) cópia consistente, com o sistema no ar (fica em /data/backups dentro do volume)
docker compose exec -T checklist node dist/backup.js

# 2) traz a cópia mais recente para fora do volume
ULTIMO="$(docker compose exec -T checklist sh -c 'ls -1 /data/backups/checklist-*.db | sort | tail -n 1' | tr -d '\r')"
[ -n "$ULTIMO" ] || { echo "Nenhum backup encontrado no container." >&2; exit 1; }
docker compose cp "checklist:$ULTIMO" "$DESTINO/"
chmod 600 "$DESTINO/$(basename "$ULTIMO")"

# 3) limpa as cópias mais antigas do destino
ls -1 "$DESTINO"/checklist-*.db 2>/dev/null | sort -r | tail -n +"$((MANTER + 1))" | while read -r antigo; do rm -f "$antigo"; done

echo "$(date '+%Y-%m-%d %H:%M') backup copiado para $DESTINO/$(basename "$ULTIMO")"
