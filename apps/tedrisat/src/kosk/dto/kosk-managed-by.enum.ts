/**
 * The values `GET /kosks?managedBy=` accepts (MDRS-108). Only `me`: the list
 * narrows to the caller's own köşks, never to someone else's — asking which
 * köşks another user manages is not something this route answers.
 */
export enum KoskManagedBy {
  ME = "me",
}
