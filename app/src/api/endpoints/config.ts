import { get, put } from '../client';
import type { UserSystemInfo, Config } from '../types';

export const configApi = {
  getUserSystem: () => get<UserSystemInfo>('/api/config'),
  updateConfig: (config: Partial<Config>) => put('/api/config', config),
};
