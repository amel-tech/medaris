import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ExampleController } from "./example.controller";
import { ExampleRepository } from "./example.repository";
import { ExampleService } from "./example.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ExampleController],
  providers: [ExampleService, ExampleRepository],
  exports: [ExampleService],
})
export class ExampleModule {}
