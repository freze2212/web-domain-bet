#!/bin/bash
cd /var/www/web-ten-mien || exit 1
set -a
. ./.env
set +a
export TZ=Asia/Ho_Chi_Minh
: > /tmp/_switch_mx_7.log
: > /tmp/_switch_mx_7.out
rm -f /tmp/_switch_mx_7.json
exec stdbuf -oL -eL node scripts/_switch_7_to_mx_git2_vps.mjs >> /tmp/_switch_mx_7.out 2>&1
