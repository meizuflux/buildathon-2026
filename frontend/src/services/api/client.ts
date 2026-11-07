import { config } from '../../constants/config';
import { makeHttpClient } from './http';
import { session } from './session';
export const http = makeHttpClient(config.baseUrl, session.getToken, config.timeoutMs);
