import { AuthContext } from '../auth/permissions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      auth?: AuthContext;
    }
  }
}

export {};
