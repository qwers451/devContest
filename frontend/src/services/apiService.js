import axios from "axios";

// ── Base URLs ─────────────────────────────────────────────────────────────────

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "";

// Legacy per-service URLs (used as fallback when no gateway is configured)
const USER_API_URL =
  import.meta.env.VITE_USER_API_URL || "http://localhost:8001";
const CONTEST_API_URL =
  import.meta.env.VITE_CONTEST_API_URL || "http://localhost:8002";
const PAYMENT_API_URL =
  import.meta.env.VITE_PAYMENT_API_URL || "http://localhost:8004";
const EVAL_API_URL =
  import.meta.env.VITE_EVAL_API_URL || "http://localhost:8003";

// Endpoints that belong to each service (used when no gateway)
const USER_ENDPOINTS    = ["/auth/", "/users"];
const PAYMENT_ENDPOINTS = ["/payments", "/escrow", "/transactions", "/payouts", "/withdrawals", "/wallet"];
const EVAL_ENDPOINTS    = ["/evaluation"];

const IMPORT_EXPORT_API_URL =
  import.meta.env.VITE_IMPORT_EXPORT_API_URL || CONTEST_API_URL;

export { USER_API_URL, CONTEST_API_URL, IMPORT_EXPORT_API_URL, PAYMENT_API_URL, EVAL_API_URL, GATEWAY_URL };

// ── Axios client factory ──────────────────────────────────────────────────────

function createClient(baseURL) {
  const client = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return client;
}

// Single gateway client (used when VITE_GATEWAY_URL is set)
const gatewayApi = createClient(GATEWAY_URL || CONTEST_API_URL);

// Per-service clients (legacy fallback)
const userApi    = createClient(USER_API_URL);
const contestApi = createClient(CONTEST_API_URL);
const _paymentApi = createClient(PAYMENT_API_URL);
const _evalApi   = createClient(EVAL_API_URL);

// ── Client selection ──────────────────────────────────────────────────────────

function getClient(endpoint) {
  if (GATEWAY_URL) return gatewayApi;
  if (USER_ENDPOINTS.some((p) => endpoint.startsWith(p)))    return userApi;
  if (PAYMENT_ENDPOINTS.some((p) => endpoint.startsWith(p))) return _paymentApi;
  if (EVAL_ENDPOINTS.some((p) => endpoint.startsWith(p)))    return _evalApi;
  return contestApi;
}

function getBaseUrl(endpoint) {
  if (GATEWAY_URL) return GATEWAY_URL;
  if (USER_ENDPOINTS.some((p) => endpoint.startsWith(p)))    return USER_API_URL;
  if (PAYMENT_ENDPOINTS.some((p) => endpoint.startsWith(p))) return PAYMENT_API_URL;
  if (EVAL_ENDPOINTS.some((p) => endpoint.startsWith(p)))    return EVAL_API_URL;
  return CONTEST_API_URL;
}

// Re-export for stores that use paymentApi / evalApi directly
// When gateway is active they resolve to the gateway client
export const paymentApi = GATEWAY_URL ? gatewayApi : _paymentApi;
export const evalApi    = GATEWAY_URL ? gatewayApi : _evalApi;

// ── API helpers ───────────────────────────────────────────────────────────────

export const fetchData = async (endpoint, params = {}) => {
  try {
    const response = await getClient(endpoint).get(endpoint, { params });
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Like fetchData but returns the raw axios response (including .status).
 * Used where the caller needs to distinguish 200 vs 404 without throwing.
 */
export const fetchDataRaw = async (endpoint, params = {}) => {
  const response = await getClient(endpoint).get(endpoint, {
    params,
    validateStatus: () => true,   // never throw on HTTP errors
  });
  return response;
};

export const sendData = async (endpoint, data = {}, isFile = false) => {
  if (isFile) {
    const baseURL = getBaseUrl(endpoint);
    const token = localStorage.getItem("token");
    const response = await fetch(`${baseURL}${endpoint}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw Object.assign(new Error("Upload failed"), { response: { data: err } });
    }
    return response.json();
  }
  try {
    const response = await getClient(endpoint).post(endpoint, data);
    return response.data;
  } catch (error) {
    console.error(`Error sending data to ${endpoint}:`, error);
    throw error;
  }
};

export const updateData = async (endpoint, data = {}) => {
  try {
    const response = await getClient(endpoint).put(endpoint, data);
    return response.data;
  } catch (error) {
    console.error(`Error updating data at ${endpoint}:`, error);
    throw error;
  }
};

export const patchData = async (endpoint, data = {}, params = {}) => {
  try {
    const response = await getClient(endpoint).patch(endpoint, data, { params });
    return response.data;
  } catch (error) {
    console.error(`Error patching data at ${endpoint}:`, error);
    throw error;
  }
};

export const deleteData = async (endpoint, config = {}) => {
  try {
    const response = await getClient(endpoint).delete(endpoint, config);
    return response.data;
  } catch (error) {
    console.error(`Error deleting data at ${endpoint}:`, error);
    throw error;
  }
};

export const downloadFileOrZip = async (endpoint, filename) => {
  const baseURL = getBaseUrl(endpoint);
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${baseURL}${endpoint}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error(`Ошибка при скачивании файла с ${endpoint}:`, error);
    throw error;
  }
};
