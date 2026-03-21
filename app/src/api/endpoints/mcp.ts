import { get, put } from '../client';
import type { GetMcpServerResponse, UpdateMcpServersBody, BaseCodingAgent } from '../types';

export const mcpApi = {
  getServers: (executor: BaseCodingAgent) => get<GetMcpServerResponse>('/api/mcp-servers', { executor }),
  updateServers: (executor: BaseCodingAgent, body: UpdateMcpServersBody) =>
    put(`/api/mcp-servers`, { executor, ...body }),
};
