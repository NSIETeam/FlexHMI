#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  echo '请先安装 Node.js 22 LTS。'; read; exit 1
fi
if [[ ! -d server/node_modules ]]; then npm ci --prefix server || exit 1; fi
if [[ ! -f client/dist/index.html ]]; then
  npm ci --prefix client && npm run build --prefix client -- --configuration production || exit 1
fi
node scripts/open-when-ready.cjs &
npm start
