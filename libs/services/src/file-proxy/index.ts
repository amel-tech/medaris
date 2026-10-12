/**
 * `@medaris/services/file-proxy`: file uploads and downloads between a web
 * app's route handlers and tedrisat (MDRS-287, MDRS-290). It sends the
 * caller's access token, so `server-only` makes a client component that
 * imports it a build error.
 */
import "server-only";

export {
  DOWNLOAD_HEADERS,
  FILE_PROXY_PATH_PREFIXES,
  type FileProxyTarget,
  isProxiablePath,
  isUuid,
  MAX_FILE_BYTES,
  MULTIPART_ALLOWANCE_BYTES,
  type ProxyDownloadOptions,
  type ProxyUploadOptions,
  proxyDownload,
  proxyUpload,
} from "./file-proxy";
