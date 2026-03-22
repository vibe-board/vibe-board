export { createApiClient, ApiError, type ApiClient, type ApiClientOptions } from './api';
export { GatewayConnection } from './gateway';
export {
  encryptBridgeRequest,
  decryptBridgeResponse,
  createSignedAuthToken,
  deriveKeysFromMasterSecret,
  generateMasterSecret,
  type E2EEKeys,
} from './crypto';
