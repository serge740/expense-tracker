import api from '../lib/api';

export interface ITAdmin {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

class ITSupportAuthService {
  async login(email: string, password: string): Promise<{ accessToken: string; itAdmin: ITAdmin }> {
    const { data } = await api.post('/it-support-auth/login', { email, password });
    return data;
  }

  async logout(): Promise<{ message: string }> {
    const { data } = await api.post('/it-support-auth/logout');
    return data;
  }

  async getProfile(): Promise<ITAdmin> {
    const { data } = await api.get('/it-support-auth/me');
    return data;
  }
}

export default new ITSupportAuthService();
