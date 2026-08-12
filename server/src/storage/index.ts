import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

export const saveFileLocally = async (fileName: string, data: Buffer): Promise<string> => {
  const folder = path.resolve(process.cwd(), env.STORAGE_DIR);
  await fs.mkdir(folder, { recursive: true });
  const filePath = path.join(folder, fileName);
  await fs.writeFile(filePath, data);
  return filePath;
};
