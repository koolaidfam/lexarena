import pdfParse from 'pdf-parse/lib/pdf-parse.js';

/**
 * Extract readable text from a PDF buffer.
 * Returns { text, pages, chars }. Throws a typed Error on failure so the
 * route can map it to a clean client-facing message.
 */
export async function extractPdfText(buffer) {
  if (!buffer || buffer.length === 0) {
    const e = new Error('The uploaded file is empty.');
    e.code = 'EMPTY_FILE';
    throw e;
  }

  // PDFs begin with "%PDF". Reject anything that isn't really a PDF, even if
  // it carries a .pdf extension / pdf mime type.
  const header = buffer.subarray(0, 5).toString('latin1');
  if (!header.startsWith('%PDF')) {
    const e = new Error('That file is not a valid PDF.');
    e.code = 'NOT_A_PDF';
    throw e;
  }

  let data;
  try {
    data = await pdfParse(buffer);
  } catch (err) {
    const e = new Error('The PDF could not be parsed. It may be corrupted or password protected.');
    e.code = 'PARSE_FAILED';
    throw e;
  }

  const text = normalise(data.text || '');
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  // Scanned / image-only PDFs parse but yield little or no extractable text.
  if (wordCount < 40) {
    const e = new Error(
      'No readable text was found. This looks like a scanned or image-only PDF; OCR is required.'
    );
    e.code = 'NO_TEXT';
    throw e;
  }

  return {
    text,
    pages: data.numpages || 0,
    chars: text.length,
    words: wordCount,
  };
}

function normalise(raw) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}
