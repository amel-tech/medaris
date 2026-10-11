import { useEffect, useState } from "react";

/**
 * The clock of a client piece of the celse detail page (MDRS-289): the
 * instant the server rendered at for the first paint, so the markup is the
 * same, then the browser's clock every half minute. The badge, the main card
 * and the agenda follow it from "upcoming" to "live" to "ended" without a
 * reload, as the join card always has.
 */
export const useCelseClock = (renderedAt: string): Date => {
  const [now, setNow] = useState(() => new Date(renderedAt));
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};
