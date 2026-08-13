import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, 'server/.env');

dotenv.config({ path: envPath });

export default defineConfig({
  schema: path.resolve(__dirname, 'server/prisma/schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
});
