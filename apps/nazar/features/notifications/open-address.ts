/** Leaves Nazar for another app's page; its own module so the specs can watch it. */
export const openAddress = (href: string): void => {
  window.location.assign(href);
};
