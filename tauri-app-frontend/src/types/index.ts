// === Server Connection Types ===

export interface ServerConfig {
  id: string;
  name: string;
  url: string;           // e.g., "http://localhost:9870"
  mode: 'direct' | 'gateway';
  gatewayUrl?: string;   // e.g., "wss://gateway.vibeboard.dev"
  gatewayToken?: string; // session token for gateway auth
  masterSecret?: string; // base64-encoded master secret for E2EE
  isDefault?: boolean;
}

export interface ServerStatus {
  serverId: string;
  connected: boolean;
  lastSeen?: string;
  latency?: number;
  error?: string;
}

// === API Response Wrapper ===

export type ApiResponse<T> = {
  data: T;
  status: 'ok' | 'error';
  error?: string;
};

// === Domain Types ===

export interface Project {
  id: string;
  name: string;
  description?: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProject {
  name: string;
  description?: string;
  repositories: CreateProjectRepo[];
}

export interface CreateProjectRepo {
  path: string;
  default_branch?: string;
}

export interface Repo {
  id: string;
  name: string;
  path: string;
  default_branch: string;
  remote_url?: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAttemptStatus extends Task {
  attempt_status?: string;
  latest_attempt_id?: string;
}

export interface CreateTask {
  project_id: string;
  title: string;
  description?: string;
}

export interface UpdateTask {
  title?: string;
  description?: string;
  status?: TaskStatus;
}

export interface Workspace {
  id: string;
  task_id: string;
  project_id: string;
  status: string;
  branch_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  workspace_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type ExecutionProcessStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface ExecutionProcess {
  id: string;
  session_id: string;
  status: ExecutionProcessStatus;
  run_reason: string;
  started_at?: string;
  finished_at?: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface Config {
  theme: 'dark' | 'light' | 'system';
  language: string;
  [key: string]: unknown;
}

export type LoginStatus =
  | { type: 'logged_out' }
  | { type: 'logged_in'; profile: ProfileResponse };

export interface ProfileResponse {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

export interface UserSystemInfo {
  config: Config;
  analytics_user_id: string;
  login_status: LoginStatus;
  environment: Record<string, string>;
}

// === Gateway Types ===

export interface GatewayInfo {
  mode: 'gateway';
  version: string;
}

export interface GatewayMachine {
  machine_id: string;
  hostname: string;
  platform: string;
  online: boolean;
  last_seen_at?: string;
}

export interface GatewayAuthCredentials {
  email: string;
  password: string;
}

export interface GatewaySignupCredentials {
  email: string;
  password: string;
  name?: string;
}

export interface GatewaySession {
  token: string;
  user_id: string;
}

export interface GatewayDeviceRegister {
  public_key: string;
  device_name: string;
}

// === E2EE Types ===

export interface EncryptedPayload {
  t: 'encrypted';
  c: string; // base64(nonce || ciphertext)
}

export type BridgeRequest =
  | { type: 'http_request'; id: string; method: string; path: string; headers: Record<string, string>; body?: string }
  | { type: 'sse_subscribe'; id: string; path: string }
  | { type: 'sse_unsubscribe'; id: string }
  | { type: 'ws_open'; id: string; path: string; query?: string }
  | { type: 'ws_data'; id: string; data: string }
  | { type: 'ws_close'; id: string }
  | { type: 'ping'; id: string };

export type BridgeResponse =
  | { type: 'http_response'; id: string; status: number; headers: Record<string, string>; body: string }
  | { type: 'sse_event'; id: string; event: string; data: string }
  | { type: 'sse_end'; id: string }
  | { type: 'ws_opened'; id: string }
  | { type: 'ws_data'; id: string; data: string }
  | { type: 'ws_closed'; id: string }
  | { type: 'pong'; id: string }
  | { type: 'error'; id: string; message: string };

export interface SignedAuthToken {
  payload: {
    public_key: string;
    timestamp: string;
  };
  signature: string;
}

// === UI Types ===

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  timestamp: number;
}
