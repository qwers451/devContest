import React, { useRef, useState } from "react";
import { importData, exportData } from "./importExportService";

const ImportExportPanel = () => {
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportData();
      setImportStatus("✅ Экспорт завершён успешно");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ошибка при экспорте данных";
      setImportStatus(`❌ ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    try {
      await importData(file);
      setImportStatus("✅ Импорт завершён успешно");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ошибка при импорте данных";
      setImportStatus(`❌ ${message}`);
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div>
      <h4 className="text-base font-bold text-gray-900 text-center mb-4">
        Импорт / экспорт базы
      </h4>
      <div className="space-y-3">
        <p className="text-sm text-gray-500 text-center">
          Архив включает данные сервисов и загруженные файлы.
        </p>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-60"
        >
          {isExporting ? "Экспорт..." : "Экспортировать"}
        </button>
        <button
          onClick={handleImportClick}
          disabled={isImporting}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors disabled:opacity-60"
        >
          {isImporting ? "Импорт..." : "Импортировать"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/zip"
          onChange={handleImport}
          className="hidden"
        />
        {importStatus && (
          <p className="text-center text-gray-500 text-sm">{importStatus}</p>
        )}
      </div>
    </div>
  );
};

export default ImportExportPanel;
