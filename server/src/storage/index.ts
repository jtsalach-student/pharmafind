import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

export const saveFileLocally = async (fileName: string, data: Buffer): Promise<string> => {
  const folder = path.resolve(process.cwd(), env.STORAGE_DIR);
  await fs.mkdir(folder, { recursive: true });
  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(folder, safeName);
  await fs.writeFile(filePath, data);
  return filePath;
};
