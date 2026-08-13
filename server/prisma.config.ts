import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

export default defineConfig({
  schema: path.resolve(__dirname, 'prisma/schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
});
