import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { McpMetadataController } from './mcp.controller.js';
import { McpResourceServer } from './mcp-resource-server.js';

@Module({
  imports: [AuthModule],
  controllers: [McpMetadataController],
  providers: [McpResourceServer],
})
export class McpModule {}
