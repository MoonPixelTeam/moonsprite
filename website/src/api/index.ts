import { API_MODE, type ApiClient } from './types'
import { localAdapter } from './local'
import { httpAdapter } from './http'

/**
 * The app's single data seam.
 *
 * Every store reads and writes through this client, so the prototype's localStorage and
 * a future server are the same thing from the app's point of view. Set
 * SITE_CONFIG.apiBaseUrl to a server and the HTTP adapter takes over — that switch is the
 * whole migration on this side.
 */
export const api: ApiClient = API_MODE === 'http' ? httpAdapter : localAdapter

/** Which adapter is live, for the pages that have to say so out loud. */
export const apiIsLocal = API_MODE === 'local'

export { STUDIO_PASSPHRASE, notifyOrdersChanged, readStudioUnlocked, writeStudioUnlocked } from './local'
export type * from './types'
