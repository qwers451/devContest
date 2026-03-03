import { fetchData, sendData} from "../../services/apiService.js";
import axios from "axios";

// Экспорт всех данных
export const exportData = async () => {
    try {
        const response = await axios.get('http://localhost:8000/api/import-export/export', {
            responseType: 'blob',
        });

        const blob = new Blob([response.data], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'exported_data_with_files.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Ошибка при экспорте данных:", error);
        throw error;
    }
};



// Импорт данных из файла
export const importData = async (file) => {
    try {
        const formData = new FormData();
        formData.append('file', file); // ZIP-файл

        const response = await sendData('/import-export/import', formData, true);
        console.log("Импорт завершён успешно", response);
        return response;
    } catch (error) {
        console.error("Ошибка при импорте данных:", error);
        throw error;
    }
};
