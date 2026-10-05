import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { LessonInvitationModule } from "../lesson-invitation/lesson-invitation.module";
import { ArchiveController } from "./archive.controller";
import { ArchiveRepository } from "./archive.repository";
import { ArchiveService } from "./archive.service";
import { MadrasahArchiveController } from "./madrasah-archive.controller";

/** The archive of hidden things (MDRS-173) and a medrese's own view of it (MDRS-185). */
@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    KoskModule,
    LessonInvitationModule,
  ],
  controllers: [ArchiveController, MadrasahArchiveController],
  providers: [ArchiveService, ArchiveRepository],
})
export class ArchiveModule {}
