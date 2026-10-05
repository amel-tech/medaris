import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MailModule } from "../mail/mail.module";
import { LessonInvitationRepository } from "./lesson-invitation.repository";
import { LessonInvitationService } from "./lesson-invitation.service";

/** Lesson invitations by e-mail (MDRS-121). Writers import this module and call `LessonInvitationService.kick`. */
@Module({
  imports: [DatabaseModule, MailModule],
  providers: [LessonInvitationRepository, LessonInvitationService],
  exports: [LessonInvitationService],
})
export class LessonInvitationModule {}
