/**
 * @medaris/sarf — the sarf engine: a root and its bâb give the twenty-four
 * sîgas of the Emsile-i Muhtelife and the çekim of each (Emsile-i Muttaride),
 * the Arabic fully vowelled and a Turkish meaning template beside it.
 *
 * Pure and platform-free: no DOM, no Node. nazar-web generates with it,
 * tedris-web lays decks out with it, and both read the same sîga keys.
 */

export * from "./bab";
export * from "./fiil";
export { maziOf as mazi, muzariOf as muzari } from "./fiil";
export {
  close,
  type Root,
  type RootProblem,
  readRoot,
  type Vowel,
} from "./harf";
export * from "./isim";
export * from "./meta";
export * from "./sarf";
export * from "./siga";
export * from "./taslak";
export {
  cek,
  conjugateMeaning,
  type Fiil,
  type Person,
  readMastar,
  type Zaman,
} from "./turkce";
