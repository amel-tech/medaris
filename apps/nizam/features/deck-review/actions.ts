"use server";

import type {
  CreatedIdResponse,
  DeckPublishRequestListResponse,
  DeckRequestCardsResponse,
  DeckRequestStatus,
  FlashcardType,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** One tab of the publish requests (nizam 16). */
export const loadDeckRequests = async (
  status: DeckRequestStatus
): Promise<AuthenticatedActionResult<DeckPublishRequestListResponse>> =>
  authenticatedAction((api) => api.nizam.listDeckPublishRequests({ status }));

/**
 * The sample cards of a request, or every card with `all`. Each call is a
 * read of a private deck, which tedrisat writes to the audit log.
 */
export const loadRequestCards = async (
  id: string,
  all: boolean
): Promise<AuthenticatedActionResult<DeckRequestCardsResponse>> =>
  authenticatedAction((api) =>
    api.nizam.readDeckPublishRequestCards({ id, all })
  );

/** "Yayımla". */
export const approveDeckRequest = async (
  id: string
): Promise<AuthenticatedActionResult<null>> => {
  const result = await authenticatedAction(async (api) => {
    await api.nizam.approveDeckPublishRequest({ id });
    return null;
  });
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Reddet", with the reason the owner will read. */
export const rejectDeckRequest = async (
  id: string,
  reason: string
): Promise<AuthenticatedActionResult<null>> => {
  const result = await authenticatedAction(async (api) => {
    await api.nizam.rejectDeckPublishRequest({
      id,
      rejectReasonDto: { reason },
    });
    return null;
  });
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** A müderris proposal's "Reddet". */
export const rejectDeckProposal = async (
  koskId: string,
  proposalId: string,
  reason: string
): Promise<AuthenticatedActionResult<null>> => {
  const result = await authenticatedAction(async (api) => {
    await api.kosks.rejectKoskDeckProposal({
      id: koskId,
      proposalId,
      rejectReasonDto: { reason },
    });
    return null;
  });
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Desteyi aç"; with a proposal id the proposal is accepted in the same step. */
export const openKoskDeck = async (
  koskId: string,
  body: {
    title: string;
    description?: string;
    cardType: FlashcardType;
    proposalId?: string;
  }
): Promise<AuthenticatedActionResult<CreatedIdResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.createKoskDeck({ id: koskId, createKoskDeckDto: body })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Gizle": the deck moves to the köşk's archive. */
export const hideKoskDeck = async (
  deckId: string
): Promise<AuthenticatedActionResult<null>> => {
  const result = await authenticatedAction(async (api) => {
    await api.kosks.hideKoskDeck({ id: deckId });
    return null;
  });
  if (result.success) revalidatePath("/", "layout");
  return result;
};
