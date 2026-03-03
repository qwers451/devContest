import axios from 'axios';

const USER_API_URL = 'http://localhost:8001';
const CONTEST_API_URL = 'http://localhost:8002';

// Endpoints that belong to user-service
const USER_ENDPOINTS = ['/auth/', '/users', '/profile'];

function isUserEndpoint(endpoint) {
    return USER_ENDPOINTS.some(prefix => endpoint.startsWith(prefix));
}

function getBaseUrl(endpoint) {
    return isUserEndpoint(endpoint) ? USER_API_URL : CONTEST_API_URL;
}

function createClient(baseURL) {
    const client = axios.create({
        baseURL,
        headers: { 'Content-Type': 'application/json' },
    });

    // Attach JWT token to every request
    client.interceptors.request.use(config => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    return client;
}

const userApi = createClient(USER_API_URL);
const contestApi = createClient(CONTEST_API_URL);

function getClient(endpoint) {
    return isUserEndpoint(endpoint) ? userApi : contestApi;
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
            ? { headers: { 'Content-Type': 'multipart/form-data' } }
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
        const response = await getClient(endpoint).get(endpoint, { responseType: 'blob' });
        const blob = new Blob([response.data], { type: response.headers['content-type'] });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error(`Ошибка при скачивании файла с ${endpoint}:`, error);
        throw error;
    }
};
