import axios from 'axios';

const API_URL = 'http://localhost:8000/api';
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// функция для GET-запросов
export const fetchData = async (endpoint, params = {}) => {
    try {
        const response = await api.get(endpoint, { params });
        return response.data;
    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        throw error;
    }
};

// функция для POST-запросов
export const sendData = async (endpoint, data = {}, isFile = false) => {
    try {
        const config = isFile 
        ? { 
            headers: { 'Content-Type': 'multipart/form-data' },
            } 
        : {};

        const response = await api.post(endpoint, data, config);
        return response.data;
    } catch (error) {
        console.error(`Error sending data to ${endpoint}:`, error);
        throw error;
    }
};

// PUT-запрос
export const updateData = async (endpoint, data = {}) => {
    try {
        const response = await api.put(endpoint, data);
        return response.data;
    } catch (error) {
        console.error(`Error updating data at ${endpoint}:`, error);
        throw error;
    }
};

// DELETE-запрос
export const deleteData = async (endpoint, config = {}) => {
    try {
        const response = await api.delete(endpoint, config);
        return response.data;
    } catch (error) {
        console.error(`Error deleting data at ${endpoint}:`, error);
        throw error;
    }
};

// GET-запрос одного файла или архива со всеми файлами
export const downloadFileOrZip = async (endpoint, filename) => {
    try {
        const response = await api.get(endpoint, {
            responseType: 'blob',
        });

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
