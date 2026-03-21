import { get, post } from '../client';
import type { AvailabilityInfo, BaseCodingAgent, RunAgentSetupRequest } from '../types';

export const profilesApi = {
  checkAvailability: (executor: BaseCodingAgent) =>
    get<AvailabilityInfo>(`/api/config/check-agent-availability`, { executor }),
  runSetup: (data: RunAgentSetupRequest) => post('/api/config/run-agent-setup', data),
};
