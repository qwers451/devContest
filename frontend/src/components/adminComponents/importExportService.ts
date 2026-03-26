import { IMPORT_EXPORT_API_URL } from "../../services/apiService";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const exportData = async (): Promise<void> => {
  const response = await fetch(
    `${IMPORT_EXPORT_API_URL}/import-export/export`,
    {
      headers: getAuthHeaders(),
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(error.detail || "Ошибка при экспорте");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "devcontest-backup.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const importData = async (file: File): Promise<unknown> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${IMPORT_EXPORT_API_URL}/import-export/import`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(error.detail || "Ошибка при импорте");
  }

  return response.json();
};
