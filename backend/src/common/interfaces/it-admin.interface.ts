import { Request } from 'express';

export interface RequestWithITAdmin extends Request {
  itAdmin: {
    id: string;
    email: string;
    name: string;
  };
}
