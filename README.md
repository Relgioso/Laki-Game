This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run db:migrate:local
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The migration command initializes the local D1 database used by `next dev`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy (Cloudflare Workers + D1)

Hosted on Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare), data in the `laki-game` D1 database (see `wrangler.jsonc`). No environment variables needed — the database is a binding.

```bash
npx wrangler login          # once, as claire@racphil.com
npm run db:migrate          # apply any new migrations/ to the live D1
npm run deploy              # build + deploy to https://laki-game.claire-835.workers.dev
```

Local production preview (Workers runtime + local D1 copy): `npm run db:migrate:local && npm run preview`.
