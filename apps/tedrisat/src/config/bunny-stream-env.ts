/** The Medaris Bunny Stream library tedrisat uploads recordings to (MDRS-116). */
export interface IBunnyStreamConfig {
  /** The video library's numeric id, as Bunny's dashboard shows it. */
  libraryId: string;
  /** The library's API key. Signs TUS uploads and calls the Stream API; never leaves tedrisat. */
  apiKey: string;
  /** The library's embed token authentication key, or null when token authentication is off. */
  tokenKey: string | null;
}

/**
 * Reads `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY` and
 * `BUNNY_STREAM_TOKEN_KEY` (`TEDRISAT__BUNNY_STREAM_*` in the root `.env`).
 *
 * Optional on purpose, like the Keycloak admin client: with neither the
 * library id nor the API key set the API boots, the upload routes answer 503
 * and the encoding poll never starts. Only one of the two being set is a
 * typo, so that stops the boot, as does a library id that is not a number.
 * The token key is optional on its own: without it the player link carries
 * no token, which plays only while the library's token authentication is off.
 */
export function readBunnyStreamConfig(
  env: NodeJS.ProcessEnv
): IBunnyStreamConfig | null {
  const libraryId = env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const apiKey = env.BUNNY_STREAM_API_KEY?.trim();
  const tokenKey = env.BUNNY_STREAM_TOKEN_KEY?.trim() || null;
  if (!libraryId && !apiKey) return null;
  if (!libraryId || !apiKey) {
    throw new Error(
      "BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY must be set together " +
        "(TEDRISAT__BUNNY_STREAM_LIBRARY_ID / TEDRISAT__BUNNY_STREAM_API_KEY in the root .env)."
    );
  }
  if (!/^\d+$/.test(libraryId)) {
    throw new Error(
      `BUNNY_STREAM_LIBRARY_ID must be the library's numeric id, got "${libraryId}".`
    );
  }
  return { libraryId, apiKey, tokenKey };
}
