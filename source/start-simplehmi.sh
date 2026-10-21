#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -d server/node_modules ] || npm ci --prefix server
if [ ! -f client/dist/index.html ]; then
  npm ci --prefix client
  npm run build --prefix client -- --configuration production
fi
exec npm start
