import { http } from '../api/client';
import { cache } from '../../storage/cache';
import { config } from '../../constants/config';
import { createMasterAdapter } from './masterAdapter';
export const backendAdapter = createMasterAdapter(http, cache, config.baseUrl);
