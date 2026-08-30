import { Controller, Get, Header } from '@nestjs/common';

import { McpResourceServer } from './mcp-resource-server.js';

/** RFC 9728 Protected Resource Metadata for the canonical MCP resource. */
@Controller('.well-known/oauth-protected-resource/mcp')
export class McpMetadataController {
  constructor(private readonly resourceServer: McpResourceServer) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  metadata() {
    return this.resourceServer.metadata();
  }
}
