# Nutrê

Aplicativo de saúde nutricional com React/Vite, Express e SQLite.

## Rodar localmente

1. `npm install`
2. `npm --prefix backend install`
3. `npm --prefix frontend install`
4. `npm run dev`

Frontend: `http://localhost:5173` · API: `http://localhost:3333`.

O backend procura `OPENAI_API_KEY` no ambiente e, apenas em desenvolvimento, usa `../token.txt` como fallback. Nunca envie esse arquivo ao Git ou ao deploy.

## Produção com Docker

1. Copie `.env.example` para `.env` e defina `JWT_SECRET` e `OPENAI_API_KEY`.
2. Rode `docker compose up -d --build`.
3. O app ficará disponível na porta `3333`.

O `token.txt` é excluído da imagem Docker; em produção use somente variáveis de ambiente.
