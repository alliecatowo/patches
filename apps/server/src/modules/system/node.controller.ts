import { Controller } from '@nestjs/common';
import {
  type GetNodeInfoRequest,
  type GetNodeInfoResponse,
  type GetNodePolicyRequest,
  type GetNodePolicyResponse,
  type NodeServiceController,
  NodeServiceControllerMethods,
} from '@patches/proto/nest';

import { NodeService } from './node.service.js';

/**
 * Transport adapter for `patches.v1.NodeService` — protobuf in, protobuf out, no business
 * logic (spec §128). Always unauthenticated (spec §163, §168): a client calls this before
 * assuming anything about node policy.
 */
@Controller()
@NodeServiceControllerMethods()
export class NodeController implements NodeServiceController {
  constructor(private readonly node: NodeService) {}

  getNodeInfo(_request: GetNodeInfoRequest): GetNodeInfoResponse {
    return this.node.getNodeInfo();
  }

  async getNodePolicy(_request: GetNodePolicyRequest): Promise<GetNodePolicyResponse> {
    return this.node.getNodePolicy();
  }
}
