import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IBunnyStorageConfig } from "../config/bunny-storage-env";
import { DatabaseModule } from "../database/database.module";
import {
  BUNNY_STORAGE_CONFIG,
  BUNNY_STORAGE_FETCH,
  BunnyObjectStorage,
} from "./bunny-object-storage";
import { ObjectStorage } from "./object-storage";
import { StorageDeletionService } from "./storage-deletion.service";
import { UploadGateInterceptor } from "./upload";
import { UploadStore } from "./upload-store";

/**
 * File storage (MDRS-287): the store behind `ObjectStorage`, Bunny Storage
 * unless a test replaces it, and the sweep that removes what nothing points at
 * any more. The config and the transport are their own providers so a test
 * can replace either.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: BUNNY_STORAGE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IBunnyStorageConfig | null =>
        config.get<IBunnyStorageConfig | null>("bunnyStorage") ?? null,
    },
    {
      provide: BUNNY_STORAGE_FETCH,
      useValue: (...args: Parameters<typeof fetch>) => fetch(...args),
    },
    { provide: ObjectStorage, useClass: BunnyObjectStorage },
    StorageDeletionService,
    UploadGateInterceptor,
    UploadStore,
  ],
  exports: [
    ObjectStorage,
    StorageDeletionService,
    UploadGateInterceptor,
    UploadStore,
  ],
})
export class StorageModule {}
