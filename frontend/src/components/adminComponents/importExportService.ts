import axios from "axios";
import { IMPORT_EXPORT_API_URL, sendData } from "../../services/apiService";

// Экспорт всех данных
export const exportData = async (): Promise<void> => {
  try {
    const response = await axios.get(
      `${IMPORT_EXPORT_API_URL}/import-export/export`,
      {
        responseType: "blob",
      },
    );

    const blob = new Blob([response.data as BlobPart], { type: "application/zip" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "exported_data_with_files.zip";
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
export const importData = async (file: File): Promise<unknown> => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await sendData("/import-export/import", formData, true);
    console.log("Импорт завершён успешно", response);
    return response;
  } catch (error) {
    console.error("Ошибка при импорте данных:", error);
    throw error;
  }
};
