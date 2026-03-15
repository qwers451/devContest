import io


def extract_text_pdf(data: bytes) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    return "\n".join(page.get_text() for page in doc).strip()


def extract_text_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts = []
    # Paragraphs at document level
    for p in doc.paragraphs:
        if p.text.strip():
            parts.append(p.text)
    # Paragraphs inside tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    if p.text.strip():
                        parts.append(p.text)
    return "\n".join(parts)


def extract_file_text(filename: str, data: bytes) -> str | None:
    """Extract plain text from PDF or DOCX file. Returns None for unsupported formats."""
    name = filename.lower()
    try:
        if name.endswith(".pdf"):
            return extract_text_pdf(data)
        elif name.endswith(".docx"):
            return extract_text_docx(data)
    except Exception:
        pass
    return None
