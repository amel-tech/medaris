import { Readable } from "node:stream";
import {
  type IStoredObject,
  ObjectStorage,
  StorageUnavailableError,
} from "../../src/storage/object-storage";

/**
 * File storage for the specs (MDRS-287): the `ObjectStorage` contract kept in
 * a map, so nothing leaves the process (MDRS-89). Hand it to `createTestApp`
 * as `{ provide: ObjectStorage, useValue: storage }`. `failing` makes every
 * call throw as an unreachable store would; `configured: false` is a server
 * without the BUNNY_STORAGE_* keys.
 */
export class MemoryObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  failing = false;

  constructor(
    private readonly prefix = "test",
    private readonly configured = true
  ) {
    super();
  }

  isConfigured(): boolean {
    return this.configured;
  }

  keyPrefix(): string {
    this.assertConfigured();
    return this.prefix;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.check();
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async get(key: string): Promise<IStoredObject | null> {
    this.check();
    const object = this.objects.get(key);
    return object
      ? { body: Readable.from([object.body]), size: object.body.length }
      : null;
  }

  async head(key: string): Promise<{ size: number | null } | null> {
    this.check();
    const object = this.objects.get(key);
    return object ? { size: object.body.length } : null;
  }

  async delete(key: string): Promise<void> {
    this.check();
    this.objects.delete(key);
  }

  /** The keys stored under a prefix, sorted. */
  keys(prefix = ""): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  private check(): void {
    this.assertConfigured();
    if (this.failing) throw new StorageUnavailableError();
  }
}
