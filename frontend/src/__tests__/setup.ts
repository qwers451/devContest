// Vitest global setup
import { vi } from 'vitest';

// Mock apiService so stores don't make real HTTP calls
vi.mock('../services/apiService', () => ({
    fetchData:         vi.fn(),
    fetchDataRaw:      vi.fn(),
    sendData:          vi.fn(),
    updateData:        vi.fn(),
    patchData:         vi.fn(),
    deleteData:        vi.fn(),
    downloadFileOrZip: vi.fn(),
    // PaymentStore uses paymentApi (axios instance) directly
    paymentApi: {
        get:  vi.fn(),
        post: vi.fn(),
    },
}));
