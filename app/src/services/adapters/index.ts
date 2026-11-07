import { config } from '../../constants/config';
import { cache } from '../../storage/cache';
import { MockAdapter } from './mockAdapter';
import { backendAdapter } from './backendAdapter';
import type { ApiAdapter } from '../api/types';
export const mockAdapter = new MockAdapter(cache);
export const adapter: ApiAdapter = config.mode === 'mock' ? mockAdapter : backendAdapter;
