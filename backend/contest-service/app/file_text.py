import io
import zipfile


def extract_text_pdf(data: bytes) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    return "\n".join(page.get_text() for page in doc).strip()


def extract_text_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts = []
    for p in doc.paragraphs:
        if p.text.strip():
            parts.append(p.text)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    if p.text.strip():
                        parts.append(p.text)
    return "\n".join(parts)


def extract_text_plain(data: bytes) -> str:
    """Извлекает текст из обычных файлов с кодом/текстом."""
    return data.decode("utf-8", errors="replace")


def extract_zip_text(data: bytes) -> str:
    """Читает ZIP-архив в памяти и извлекает исходный код."""
    text_parts = []

    # Расширения файлов, которые мы разрешаем читать нейросети (чтобы не читать бинарники)
    allowed_exts = {
        ".py",
        ".js",
        ".ts",
        ".jsx",
        ".tsx",
        ".html",
        ".css",
        ".scss",
        ".json",
        ".md",
        ".txt",
        ".java",
        ".cpp",
        ".c",
        ".go",
        ".rs",
        ".php",
        ".yaml",
        ".yml",
        ".ini",
        ".env.example",
        ".sh",
        ".sql",
    }

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for info in z.infolist():
                # Игнорируем папки и скрытые файлы (например, .git или __pycache__)
                if (
                    info.is_dir()
                    or "__MACOSX" in info.filename
                    or ".git/" in info.filename
                ):
                    continue

                # Игнорируем слишком большие файлы (больше 1 МБ), чтобы не переполнить контекст ИИ
                if info.file_size > 1024 * 1024:
                    continue

                filename_lower = info.filename.lower()
                ext = (
                    "." + filename_lower.split(".")[-1] if "." in filename_lower else ""
                )

                # Проверяем, подходит ли файл (по расширению или если это Dockerfile/Makefile)
                if (
                    ext in allowed_exts
                    or "dockerfile" in filename_lower
                    or "makefile" in filename_lower
                ):
                    try:
                        content = z.read(info.filename).decode("utf-8")
                        # Добавляем разделитель и имя файла, чтобы ИИ понимал архитектуру проекта
                        text_parts.append(f"/// Файл: {info.filename} ///\n{content}")
                    except UnicodeDecodeError:
                        pass  # Если не удалось декодировать (бинарник), просто пропускаем

        return "\n\n".join(text_parts)
    except zipfile.BadZipFile:
        return "[Ошибка: Невозможно прочитать ZIP-архив]"


def extract_file_text(filename: str, data: bytes) -> str | None:
    """Главная функция-маршрутизатор для извлечения текста из файлов."""
    name = filename.lower()
    try:
        if name.endswith(".pdf"):
            return extract_text_pdf(data)
        elif name.endswith(".docx"):
            return extract_text_docx(data)
        elif name.endswith(".zip"):
            return extract_zip_text(data)
        # Если загрузили код не в архиве, а просто отдельными файлами:
        elif name.endswith(
            (
                ".txt",
                ".py",
                ".js",
                ".json",
                ".md",
                ".html",
                ".css",
                ".yaml",
                ".yml",
                ".sql",
            )
        ):
            return extract_text_plain(data)
    except Exception:
        pass
    return None
