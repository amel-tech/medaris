import { HealthCheckDto } from "@medaris/common";
import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { AppService } from "./app.service";

@ApiTags("Teskilat Service")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: "Get hello message",
    description: "Returns a greeting message from the Teskilat service",
    operationId: "getTeskilatHello",
  })
  @ApiResponse({
    status: 200,
    description: "Greeting message",
    type: String,
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("health")
  @ApiOperation({
    summary: "Health check",
    description: "Returns the health status of the Teskilat service",
    operationId: "getTeskilatHealth",
  })
  @ApiResponse({
    status: 200,
    description: "Service health information",
    type: HealthCheckDto,
  })
  getHealth(): HealthCheckDto {
    return this.appService.getHealth();
  }
}
