import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface User {
      id: string;
      role: Role;
      username: string;
    }

    interface Request {
      requestId: string;
      user?: User;
    }
  }
}

export {};
