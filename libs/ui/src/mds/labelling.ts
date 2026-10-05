export interface Labelling {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * The naming attributes a caller set, and only those. Base UI's `mergeProps`
 * lets an explicit `undefined` overwrite what `Field` wires
 * (`aria-labelledby`, `aria-describedby`), so a key that was not given must
 * not reach `Field.Control` at all.
 */
export function labelling(props: Labelling): Labelling {
  const out: Labelling = {};
  if (props["aria-label"] !== undefined)
    out["aria-label"] = props["aria-label"];
  if (props["aria-labelledby"] !== undefined)
    out["aria-labelledby"] = props["aria-labelledby"];
  if (props["aria-describedby"] !== undefined)
    out["aria-describedby"] = props["aria-describedby"];
  return out;
}
