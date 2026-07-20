/**
 * Common MIME types used by TokenKit request helpers.
 */
export const MIME_TYPES = {
    JSON: 'application/json',
    FORM_URLENCODED: 'application/x-www-form-urlencoded',
    MULTIPART_FORM_DATA: 'multipart/form-data',
    OCTET_STREAM: 'application/octet-stream',
    TEXT: 'text/plain',
    CSV: 'text/csv',
    PDF: 'application/pdf',
    DOC: 'application/msword',
    DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    XLS: 'application/vnd.ms-excel',
    XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    PPT: 'application/vnd.ms-powerpoint',
    PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    PNG: 'image/png',
    JPEG: 'image/jpeg',
    GIF: 'image/gif',
    WEBP: 'image/webp',
    SVG: 'image/svg+xml',
    ZIP: 'application/zip',
} as const;

export type KnownMimeType = typeof MIME_TYPES[keyof typeof MIME_TYPES];

const DOCUMENT_MIME_TYPES_BY_EXTENSION: Record<string, KnownMimeType> = {
    csv: MIME_TYPES.CSV,
    doc: MIME_TYPES.DOC,
    docx: MIME_TYPES.DOCX,
    gif: MIME_TYPES.GIF,
    jpeg: MIME_TYPES.JPEG,
    jpg: MIME_TYPES.JPEG,
    pdf: MIME_TYPES.PDF,
    png: MIME_TYPES.PNG,
    ppt: MIME_TYPES.PPT,
    pptx: MIME_TYPES.PPTX,
    svg: MIME_TYPES.SVG,
    txt: MIME_TYPES.TEXT,
    webp: MIME_TYPES.WEBP,
    xls: MIME_TYPES.XLS,
    xlsx: MIME_TYPES.XLSX,
    zip: MIME_TYPES.ZIP,
};

export function normalizeMimeType(contentType?: string | null): string | undefined {
    const mimeType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
    return mimeType || undefined;
}

export function isMultipartFormData(contentType?: string | null): boolean {
    return normalizeMimeType(contentType) === MIME_TYPES.MULTIPART_FORM_DATA;
}

export function shouldSetContentTypeHeader(contentType?: string | null): boolean {
    return !!contentType && !isMultipartFormData(contentType);
}

export function getDocumentMimeType(filename: string, fallback: string = MIME_TYPES.OCTET_STREAM): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? DOCUMENT_MIME_TYPES_BY_EXTENSION[extension] ?? fallback : fallback;
}
