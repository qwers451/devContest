import { vi } from 'vitest';

vi.mock('../services/apiService', () => ({
    fetchData:         vi.fn(),
    fetchDataRaw:      vi.fn(),
    sendData:          vi.fn(),
    updateData:        vi.fn(),
    patchData:         vi.fn(),
    deleteData:        vi.fn(),
    downloadFileOrZip: vi.fn(),
    paymentApi: {
        get:  vi.fn(),
        post: vi.fn(),
    },
}));
