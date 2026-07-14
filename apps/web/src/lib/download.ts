import api from "./api";

/**
 * Fetch a file from an authenticated API endpoint and trigger a browser download.
 *
 * A plain <a href> download can't carry the Bearer token our API requires, so
 * those requests 401. Instead we pull the file as a blob through the shared axios
 * client (which attaches the token) and save it client-side.
 */
export async function downloadFile(
    url: string,
    fallbackFilename: string,
    params?: Record<string, string | undefined>
): Promise<void> {
    const res = await api.get(url, { params, responseType: "blob" });

    // Prefer the filename the server suggested in Content-Disposition.
    let filename = fallbackFilename;
    const disposition = res.headers?.["content-disposition"] as string | undefined;
    const match = disposition?.match(/filename="?([^"]+)"?/);
    if (match?.[1]) filename = match[1];

    const blobUrl = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
}
