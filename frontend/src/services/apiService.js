import axios from "axios";

const USER_API_URL =
  import.meta.env.VITE_USER_API_URL || "http://localhost:8001";
const CONTEST_API_URL =
  import.meta.env.VITE_CONTEST_API_URL || "http://localhost:8002";
const IMPORT_EXPORT_API_URL =
  import.meta.env.VITE_IMPORT_EXPORT_API_URL || CONTEST_API_URL;
const PAYMENT_API_URL =
  import.meta.env.VITE_PAYMENT_API_URL || "http://localhost:8004";
const EVAL_API_URL =
  import.meta.env.VITE_EVAL_API_URL || "http://localhost:8003";

// Endpoints that belong to user-service
const USER_ENDPOINTS = ["/auth/", "/users", "/profile"];
// Endpoints that belong to payment-service
const PAYMENT_ENDPOINTS = ["/payments", "/escrow", "/transactions", "/payouts", "/withdrawals"];
// Endpoints that belong to evaluation-service
const EVAL_ENDPOINTS = ["/evaluation"];

export { USER_API_URL, CONTEST_API_URL, IMPORT_EXPORT_API_URL, PAYMENT_API_URL, EVAL_API_URL };

function isUserEndpoint(endpoint) {
  return USER_ENDPOINTS.some((prefix) => endpoint.startsWith(prefix));
}

function isPaymentEndpoint(endpoint) {
  return PAYMENT_ENDPOINTS.some((prefix) => endpoint.startsWith(prefix));
}

function isEvalEndpoint(endpoint) {
  return EVAL_ENDPOINTS.some((prefix) => endpoint.startsWith(prefix));
}

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

const userApi = createClient(USER_API_URL);
const contestApi = createClient(CONTEST_API_URL);
export const paymentApi = createClient(PAYMENT_API_URL);
export const evalApi = createClient(EVAL_API_URL);

function getClient(endpoint) {
  if (isUserEndpoint(endpoint)) return userApi;
  if (isPaymentEndpoint(endpoint)) return paymentApi;
  if (isEvalEndpoint(endpoint)) return evalApi;
  return contestApi;
}

export const fetchData = async (endpoint, params = {}) => {
  try {
    const response = await getClient(endpoint).get(endpoint, { params });
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error);
    throw error;
  }
};

export const sendData = async (endpoint, data = {}, isFile = false) => {
  try {
    const config = isFile
      ? { headers: { "Content-Type": "multipart/form-data" } }
      : {};
    const response = await getClient(endpoint).post(endpoint, data, config);
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
    const response = await getClient(endpoint).patch(endpoint, data, {
      params,
    });
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
  try {
    const response = await getClient(endpoint).get(endpoint, {
      responseType: "blob",
    });
    const blob = new Blob([response.data], {
      type: response.headers["content-type"],
    });
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
