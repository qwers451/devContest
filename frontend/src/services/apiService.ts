import axios, { type AxiosInstance, type AxiosResponse } from "axios";

const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? "";

const USER_API_URL =
  (import.meta.env.VITE_USER_API_URL as string | undefined) ??
  "http://localhost:8001";
const CONTEST_API_URL =
  (import.meta.env.VITE_CONTEST_API_URL as string | undefined) ??
  "http://localhost:8002";
const PAYMENT_API_URL =
  (import.meta.env.VITE_PAYMENT_API_URL as string | undefined) ??
  "http://localhost:8004";
const EVAL_API_URL =
  (import.meta.env.VITE_EVAL_API_URL as string | undefined) ??
  "http://localhost:8003";

const USER_ENDPOINTS = ["/auth/", "/users"];
const PAYMENT_ENDPOINTS = [
  "/payments",
  "/escrow",
  "/transactions",
  "/payouts",
  "/withdrawals",
  "/wallet",
];
const EVAL_ENDPOINTS = ["/evaluation"];

const IMPORT_EXPORT_API_URL =
  (import.meta.env.VITE_IMPORT_EXPORT_API_URL as string | undefined) ??
  CONTEST_API_URL;

export {
  USER_API_URL,
  CONTEST_API_URL,
  IMPORT_EXPORT_API_URL,
  PAYMENT_API_URL,
  EVAL_API_URL,
  GATEWAY_URL,
};

function createClient(baseURL: string): AxiosInstance {
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

const gatewayApi = createClient(GATEWAY_URL || CONTEST_API_URL);
const userApi = createClient(USER_API_URL);
const contestApi = createClient(CONTEST_API_URL);
const _paymentApi = createClient(PAYMENT_API_URL);
const _evalApi = createClient(EVAL_API_URL);

function getClient(endpoint: string): AxiosInstance {
  if (GATEWAY_URL) return gatewayApi;
  if (USER_ENDPOINTS.some((p) => endpoint.startsWith(p))) return userApi;
  if (PAYMENT_ENDPOINTS.some((p) => endpoint.startsWith(p))) return _paymentApi;
  if (EVAL_ENDPOINTS.some((p) => endpoint.startsWith(p))) return _evalApi;
  return contestApi;
}

function getBaseUrl(endpoint: string): string {
  if (GATEWAY_URL) return GATEWAY_URL;
  if (USER_ENDPOINTS.some((p) => endpoint.startsWith(p))) return USER_API_URL;
  if (PAYMENT_ENDPOINTS.some((p) => endpoint.startsWith(p)))
    return PAYMENT_API_URL;
  if (EVAL_ENDPOINTS.some((p) => endpoint.startsWith(p))) return EVAL_API_URL;
  return CONTEST_API_URL;
}

export const paymentApi = GATEWAY_URL ? gatewayApi : _paymentApi;
export const evalApi = GATEWAY_URL ? gatewayApi : _evalApi;

export const fetchData = async <T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: { silent?: boolean } = {},
): Promise<T> => {
  try {
    const response = await getClient(endpoint).get<T>(endpoint, { params });
    return response.data;
  } catch (error) {
    if (!options.silent)
      console.error(`Error fetching data from ${endpoint}:`, error);
    throw error;
  }
};

export const fetchDataRaw = async <T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<AxiosResponse<T>> => {
  const response = await getClient(endpoint).get<T>(endpoint, {
    params,
    validateStatus: () => true,
  });
  return response;
};

export const sendData = async <T = unknown>(
  endpoint: string,
  data: unknown = {},
  isFile = false,
): Promise<T> => {
  if (isFile) {
    const baseURL = getBaseUrl(endpoint);
    const token = localStorage.getItem("token");
    const response = await fetch(`${baseURL}${endpoint}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data as BodyInit,
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };
      throw Object.assign(new Error("Upload failed"), {
        response: { data: err },
      });
    }
    return response.json() as Promise<T>;
  }
  try {
    const response = await getClient(endpoint).post<T>(endpoint, data);
    return response.data;
  } catch (error) {
    console.error(`Error sending data to ${endpoint}:`, error);
    throw error;
  }
};

export const updateData = async <T = unknown>(
  endpoint: string,
  data: unknown = {},
): Promise<T> => {
  try {
    const response = await getClient(endpoint).put<T>(endpoint, data);
    return response.data;
  } catch (error) {
    console.error(`Error updating data at ${endpoint}:`, error);
    throw error;
  }
};

export const patchData = async <T = unknown>(
  endpoint: string,
  data: unknown = {},
  params: Record<string, unknown> = {},
): Promise<T> => {
  try {
    const response = await getClient(endpoint).patch<T>(endpoint, data, {
      params,
    });
    return response.data;
  } catch (error) {
    console.error(`Error patching data at ${endpoint}:`, error);
    throw error;
  }
};

export const deleteData = async <T = unknown>(
  endpoint: string,
  config: Record<string, unknown> = {},
): Promise<T> => {
  try {
    const response = await getClient(endpoint).delete<T>(endpoint, config);
    return response.data;
  } catch (error) {
    console.error(`Error deleting data at ${endpoint}:`, error);
    throw error;
  }
};

export const downloadFileOrZip = async (
  endpoint: string,
  filename: string,
): Promise<void> => {
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
