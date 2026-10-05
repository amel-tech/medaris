import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IBunnyStreamConfig } from "../config/bunny-stream-env";
import {
  BUNNY_STREAM_CONFIG,
  BUNNY_STREAM_FETCH,
  BunnyStreamClient,
} from "./bunny-stream.client";

/** The Bunny Stream client (MDRS-116), with its config and transport as their own providers so a test can replace either. */
@Module({
  providers: [
    {
      provide: BUNNY_STREAM_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IBunnyStreamConfig | null =>
        config.get<IBunnyStreamConfig | null>("bunnyStream") ?? null,
    },
    {
      provide: BUNNY_STREAM_FETCH,
      useValue: (...args: Parameters<typeof fetch>) => fetch(...args),
    },
    BunnyStreamClient,
  ],
  exports: [BunnyStreamClient],
})
export class BunnyStreamModule {}
