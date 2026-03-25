import asyncio
import os
import tempfile
from pathlib import Path

# Only one Docling conversion runs at a time — concurrent conversions exhaust RAM
_convert_semaphore = asyncio.Semaphore(1)


class DocumentService:
    """Converts uploaded PDF/DOCX/Image files to Markdown using Docling."""

    def __init__(self):
        # Lazy-init so the heavy Docling import doesn't block startup.
        self._converter = None

    def _get_converter(self):
        if self._converter is None:
            from docling.document_converter import DocumentConverter
            self._converter = DocumentConverter()
        return self._converter

    def _convert_sync(self, file_bytes: bytes, filename: str) -> str:
        """Synchronous conversion — must be called from a thread, not the event loop."""
        suffix = Path(filename).suffix or ".pdf"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            converter = self._get_converter()
            result = converter.convert(tmp_path)
            return result.document.export_to_markdown()
        finally:
            os.unlink(tmp_path)

    async def extract_markdown(self, file_bytes: bytes, filename: str) -> str:
        """Convert file bytes to Markdown without blocking the event loop.
        Serialised via semaphore to prevent concurrent conversions from exhausting RAM."""
        async with _convert_semaphore:
            return await asyncio.to_thread(self._convert_sync, file_bytes, filename)


document_service = DocumentService()
