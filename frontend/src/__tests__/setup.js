// Vitest global setup
import { vi } from 'vitest';

// Mock apiService so stores don't make real HTTP calls
vi.mock('../services/apiService', () => ({
    fetchData:  vi.fn(),
    sendData:   vi.fn(),
    updateData: vi.fn(),
    patchData:  vi.fn(),
    deleteData: vi.fn(),
    downloadFileOrZip: vi.fn(),
}));
