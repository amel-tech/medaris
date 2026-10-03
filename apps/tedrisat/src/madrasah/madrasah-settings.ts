import type {
  IMadrasahPolicies,
  IUpdateMadrasahSettings,
} from "./madrasah.repository.interface";

export const NO_POLICIES: IMadrasahPolicies = {
  closedCourseRequired: false,
  alwaysApproval: false,
  noPublicRecordings: false,
};

export interface ISettingsState {
  name: string;
  description: string | null;
  policies: IMadrasahPolicies;
}

export interface ISettingsPlan {
  next: ISettingsState;
  /** The fields that really change, by name (`policies.alwaysApproval`), for the audit row. */
  changes: Record<string, { from: unknown; to: unknown }>;
}

/**
 * What saving nazir/04 changes, as plain data (the `planGrants` of the settings
 * screen): the text is trimmed, a blank description is none, and a field sent
 * with the value it already has changes nothing. A save that changes nothing
 * leaves "Son değişiklik" and the audit log alone.
 */
export function planSettingsUpdate(
  current: ISettingsState,
  patch: IUpdateMadrasahSettings
): ISettingsPlan {
  const next: ISettingsState = {
    ...current,
    policies: { ...current.policies },
  };
  const changes: ISettingsPlan["changes"] = {};

  if (patch.name !== undefined && patch.name.trim() !== current.name) {
    next.name = patch.name.trim();
    changes.name = { from: current.name, to: next.name };
  }
  if (patch.description !== undefined) {
    const description = patch.description?.trim() || null;
    if (description !== current.description) {
      next.description = description;
      changes.description = { from: current.description, to: description };
    }
  }
  for (const key of Object.keys(NO_POLICIES) as Array<
    keyof IMadrasahPolicies
  >) {
    const wanted = patch.policies?.[key];
    if (wanted !== undefined && wanted !== current.policies[key]) {
      next.policies[key] = wanted;
      changes[`policies.${key}`] = { from: current.policies[key], to: wanted };
    }
  }
  return { next, changes };
}
