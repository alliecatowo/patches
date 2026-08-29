package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Topical communities a post may optionally belong to (spec §189–190). A community
 * moderator's authority stops at the community boundary (spec §192) — no cross-community
 * power, and every moderation action here is audited (spec §66).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/communities.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class CommunityServiceGrpc {

  private CommunityServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.CommunityService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.CreateCommunityRequest,
      patches.v1.Communities.CreateCommunityResponse> getCreateCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateCommunity",
      requestType = patches.v1.Communities.CreateCommunityRequest.class,
      responseType = patches.v1.Communities.CreateCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.CreateCommunityRequest,
      patches.v1.Communities.CreateCommunityResponse> getCreateCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.CreateCommunityRequest, patches.v1.Communities.CreateCommunityResponse> getCreateCommunityMethod;
    if ((getCreateCommunityMethod = CommunityServiceGrpc.getCreateCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getCreateCommunityMethod = CommunityServiceGrpc.getCreateCommunityMethod) == null) {
          CommunityServiceGrpc.getCreateCommunityMethod = getCreateCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.CreateCommunityRequest, patches.v1.Communities.CreateCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.CreateCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.CreateCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("CreateCommunity"))
              .build();
        }
      }
    }
    return getCreateCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.GetCommunityRequest,
      patches.v1.Communities.GetCommunityResponse> getGetCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetCommunity",
      requestType = patches.v1.Communities.GetCommunityRequest.class,
      responseType = patches.v1.Communities.GetCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.GetCommunityRequest,
      patches.v1.Communities.GetCommunityResponse> getGetCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.GetCommunityRequest, patches.v1.Communities.GetCommunityResponse> getGetCommunityMethod;
    if ((getGetCommunityMethod = CommunityServiceGrpc.getGetCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getGetCommunityMethod = CommunityServiceGrpc.getGetCommunityMethod) == null) {
          CommunityServiceGrpc.getGetCommunityMethod = getGetCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.GetCommunityRequest, patches.v1.Communities.GetCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.GetCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.GetCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("GetCommunity"))
              .build();
        }
      }
    }
    return getGetCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.ListCommunitiesRequest,
      patches.v1.Communities.ListCommunitiesResponse> getListCommunitiesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListCommunities",
      requestType = patches.v1.Communities.ListCommunitiesRequest.class,
      responseType = patches.v1.Communities.ListCommunitiesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.ListCommunitiesRequest,
      patches.v1.Communities.ListCommunitiesResponse> getListCommunitiesMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.ListCommunitiesRequest, patches.v1.Communities.ListCommunitiesResponse> getListCommunitiesMethod;
    if ((getListCommunitiesMethod = CommunityServiceGrpc.getListCommunitiesMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getListCommunitiesMethod = CommunityServiceGrpc.getListCommunitiesMethod) == null) {
          CommunityServiceGrpc.getListCommunitiesMethod = getListCommunitiesMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.ListCommunitiesRequest, patches.v1.Communities.ListCommunitiesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListCommunities"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.ListCommunitiesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.ListCommunitiesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("ListCommunities"))
              .build();
        }
      }
    }
    return getListCommunitiesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.JoinCommunityRequest,
      patches.v1.Communities.JoinCommunityResponse> getJoinCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "JoinCommunity",
      requestType = patches.v1.Communities.JoinCommunityRequest.class,
      responseType = patches.v1.Communities.JoinCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.JoinCommunityRequest,
      patches.v1.Communities.JoinCommunityResponse> getJoinCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.JoinCommunityRequest, patches.v1.Communities.JoinCommunityResponse> getJoinCommunityMethod;
    if ((getJoinCommunityMethod = CommunityServiceGrpc.getJoinCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getJoinCommunityMethod = CommunityServiceGrpc.getJoinCommunityMethod) == null) {
          CommunityServiceGrpc.getJoinCommunityMethod = getJoinCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.JoinCommunityRequest, patches.v1.Communities.JoinCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "JoinCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.JoinCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.JoinCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("JoinCommunity"))
              .build();
        }
      }
    }
    return getJoinCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.LeaveCommunityRequest,
      patches.v1.Communities.LeaveCommunityResponse> getLeaveCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "LeaveCommunity",
      requestType = patches.v1.Communities.LeaveCommunityRequest.class,
      responseType = patches.v1.Communities.LeaveCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.LeaveCommunityRequest,
      patches.v1.Communities.LeaveCommunityResponse> getLeaveCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.LeaveCommunityRequest, patches.v1.Communities.LeaveCommunityResponse> getLeaveCommunityMethod;
    if ((getLeaveCommunityMethod = CommunityServiceGrpc.getLeaveCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getLeaveCommunityMethod = CommunityServiceGrpc.getLeaveCommunityMethod) == null) {
          CommunityServiceGrpc.getLeaveCommunityMethod = getLeaveCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.LeaveCommunityRequest, patches.v1.Communities.LeaveCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "LeaveCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.LeaveCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.LeaveCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("LeaveCommunity"))
              .build();
        }
      }
    }
    return getLeaveCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.ListCommunityMembersRequest,
      patches.v1.Communities.ListCommunityMembersResponse> getListCommunityMembersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListCommunityMembers",
      requestType = patches.v1.Communities.ListCommunityMembersRequest.class,
      responseType = patches.v1.Communities.ListCommunityMembersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.ListCommunityMembersRequest,
      patches.v1.Communities.ListCommunityMembersResponse> getListCommunityMembersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.ListCommunityMembersRequest, patches.v1.Communities.ListCommunityMembersResponse> getListCommunityMembersMethod;
    if ((getListCommunityMembersMethod = CommunityServiceGrpc.getListCommunityMembersMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getListCommunityMembersMethod = CommunityServiceGrpc.getListCommunityMembersMethod) == null) {
          CommunityServiceGrpc.getListCommunityMembersMethod = getListCommunityMembersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.ListCommunityMembersRequest, patches.v1.Communities.ListCommunityMembersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListCommunityMembers"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.ListCommunityMembersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.ListCommunityMembersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("ListCommunityMembers"))
              .build();
        }
      }
    }
    return getListCommunityMembersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.UpdateCommunityRequest,
      patches.v1.Communities.UpdateCommunityResponse> getUpdateCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateCommunity",
      requestType = patches.v1.Communities.UpdateCommunityRequest.class,
      responseType = patches.v1.Communities.UpdateCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.UpdateCommunityRequest,
      patches.v1.Communities.UpdateCommunityResponse> getUpdateCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.UpdateCommunityRequest, patches.v1.Communities.UpdateCommunityResponse> getUpdateCommunityMethod;
    if ((getUpdateCommunityMethod = CommunityServiceGrpc.getUpdateCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getUpdateCommunityMethod = CommunityServiceGrpc.getUpdateCommunityMethod) == null) {
          CommunityServiceGrpc.getUpdateCommunityMethod = getUpdateCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.UpdateCommunityRequest, patches.v1.Communities.UpdateCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.UpdateCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.UpdateCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("UpdateCommunity"))
              .build();
        }
      }
    }
    return getUpdateCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.SetCommunityRoleRequest,
      patches.v1.Communities.SetCommunityRoleResponse> getSetCommunityRoleMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SetCommunityRole",
      requestType = patches.v1.Communities.SetCommunityRoleRequest.class,
      responseType = patches.v1.Communities.SetCommunityRoleResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.SetCommunityRoleRequest,
      patches.v1.Communities.SetCommunityRoleResponse> getSetCommunityRoleMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.SetCommunityRoleRequest, patches.v1.Communities.SetCommunityRoleResponse> getSetCommunityRoleMethod;
    if ((getSetCommunityRoleMethod = CommunityServiceGrpc.getSetCommunityRoleMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getSetCommunityRoleMethod = CommunityServiceGrpc.getSetCommunityRoleMethod) == null) {
          CommunityServiceGrpc.getSetCommunityRoleMethod = getSetCommunityRoleMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.SetCommunityRoleRequest, patches.v1.Communities.SetCommunityRoleResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SetCommunityRole"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.SetCommunityRoleRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.SetCommunityRoleResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("SetCommunityRole"))
              .build();
        }
      }
    }
    return getSetCommunityRoleMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.RemovePostFromCommunityRequest,
      patches.v1.Communities.RemovePostFromCommunityResponse> getRemovePostFromCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RemovePostFromCommunity",
      requestType = patches.v1.Communities.RemovePostFromCommunityRequest.class,
      responseType = patches.v1.Communities.RemovePostFromCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.RemovePostFromCommunityRequest,
      patches.v1.Communities.RemovePostFromCommunityResponse> getRemovePostFromCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.RemovePostFromCommunityRequest, patches.v1.Communities.RemovePostFromCommunityResponse> getRemovePostFromCommunityMethod;
    if ((getRemovePostFromCommunityMethod = CommunityServiceGrpc.getRemovePostFromCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getRemovePostFromCommunityMethod = CommunityServiceGrpc.getRemovePostFromCommunityMethod) == null) {
          CommunityServiceGrpc.getRemovePostFromCommunityMethod = getRemovePostFromCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.RemovePostFromCommunityRequest, patches.v1.Communities.RemovePostFromCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RemovePostFromCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.RemovePostFromCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.RemovePostFromCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("RemovePostFromCommunity"))
              .build();
        }
      }
    }
    return getRemovePostFromCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.BanFromCommunityRequest,
      patches.v1.Communities.BanFromCommunityResponse> getBanFromCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BanFromCommunity",
      requestType = patches.v1.Communities.BanFromCommunityRequest.class,
      responseType = patches.v1.Communities.BanFromCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.BanFromCommunityRequest,
      patches.v1.Communities.BanFromCommunityResponse> getBanFromCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.BanFromCommunityRequest, patches.v1.Communities.BanFromCommunityResponse> getBanFromCommunityMethod;
    if ((getBanFromCommunityMethod = CommunityServiceGrpc.getBanFromCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getBanFromCommunityMethod = CommunityServiceGrpc.getBanFromCommunityMethod) == null) {
          CommunityServiceGrpc.getBanFromCommunityMethod = getBanFromCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.BanFromCommunityRequest, patches.v1.Communities.BanFromCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BanFromCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.BanFromCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.BanFromCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("BanFromCommunity"))
              .build();
        }
      }
    }
    return getBanFromCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.InviteToCommunityRequest,
      patches.v1.Communities.InviteToCommunityResponse> getInviteToCommunityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "InviteToCommunity",
      requestType = patches.v1.Communities.InviteToCommunityRequest.class,
      responseType = patches.v1.Communities.InviteToCommunityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.InviteToCommunityRequest,
      patches.v1.Communities.InviteToCommunityResponse> getInviteToCommunityMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.InviteToCommunityRequest, patches.v1.Communities.InviteToCommunityResponse> getInviteToCommunityMethod;
    if ((getInviteToCommunityMethod = CommunityServiceGrpc.getInviteToCommunityMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getInviteToCommunityMethod = CommunityServiceGrpc.getInviteToCommunityMethod) == null) {
          CommunityServiceGrpc.getInviteToCommunityMethod = getInviteToCommunityMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.InviteToCommunityRequest, patches.v1.Communities.InviteToCommunityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "InviteToCommunity"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.InviteToCommunityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.InviteToCommunityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("InviteToCommunity"))
              .build();
        }
      }
    }
    return getInviteToCommunityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Communities.RespondToCommunityInviteRequest,
      patches.v1.Communities.RespondToCommunityInviteResponse> getRespondToCommunityInviteMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RespondToCommunityInvite",
      requestType = patches.v1.Communities.RespondToCommunityInviteRequest.class,
      responseType = patches.v1.Communities.RespondToCommunityInviteResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Communities.RespondToCommunityInviteRequest,
      patches.v1.Communities.RespondToCommunityInviteResponse> getRespondToCommunityInviteMethod() {
    io.grpc.MethodDescriptor<patches.v1.Communities.RespondToCommunityInviteRequest, patches.v1.Communities.RespondToCommunityInviteResponse> getRespondToCommunityInviteMethod;
    if ((getRespondToCommunityInviteMethod = CommunityServiceGrpc.getRespondToCommunityInviteMethod) == null) {
      synchronized (CommunityServiceGrpc.class) {
        if ((getRespondToCommunityInviteMethod = CommunityServiceGrpc.getRespondToCommunityInviteMethod) == null) {
          CommunityServiceGrpc.getRespondToCommunityInviteMethod = getRespondToCommunityInviteMethod =
              io.grpc.MethodDescriptor.<patches.v1.Communities.RespondToCommunityInviteRequest, patches.v1.Communities.RespondToCommunityInviteResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RespondToCommunityInvite"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.RespondToCommunityInviteRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Communities.RespondToCommunityInviteResponse.getDefaultInstance()))
              .setSchemaDescriptor(new CommunityServiceMethodDescriptorSupplier("RespondToCommunityInvite"))
              .build();
        }
      }
    }
    return getRespondToCommunityInviteMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static CommunityServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<CommunityServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<CommunityServiceStub>() {
        @java.lang.Override
        public CommunityServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new CommunityServiceStub(channel, callOptions);
        }
      };
    return CommunityServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static CommunityServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<CommunityServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<CommunityServiceBlockingV2Stub>() {
        @java.lang.Override
        public CommunityServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new CommunityServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return CommunityServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static CommunityServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<CommunityServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<CommunityServiceBlockingStub>() {
        @java.lang.Override
        public CommunityServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new CommunityServiceBlockingStub(channel, callOptions);
        }
      };
    return CommunityServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static CommunityServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<CommunityServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<CommunityServiceFutureStub>() {
        @java.lang.Override
        public CommunityServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new CommunityServiceFutureStub(channel, callOptions);
        }
      };
    return CommunityServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Topical communities a post may optionally belong to (spec §189–190). A community
   * moderator's authority stops at the community boundary (spec §192) — no cross-community
   * power, and every moderation action here is audited (spec §66).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void createCommunity(patches.v1.Communities.CreateCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.CreateCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateCommunityMethod(), responseObserver);
    }

    /**
     */
    default void getCommunity(patches.v1.Communities.GetCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.GetCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetCommunityMethod(), responseObserver);
    }

    /**
     */
    default void listCommunities(patches.v1.Communities.ListCommunitiesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.ListCommunitiesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListCommunitiesMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: joining a community the caller already belongs to is not an error.
     * </pre>
     */
    default void joinCommunity(patches.v1.Communities.JoinCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.JoinCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getJoinCommunityMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: leaving a community the caller doesn't belong to is not an error.
     * </pre>
     */
    default void leaveCommunity(patches.v1.Communities.LeaveCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.LeaveCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getLeaveCommunityMethod(), responseObserver);
    }

    /**
     */
    default void listCommunityMembers(patches.v1.Communities.ListCommunityMembersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.ListCommunityMembersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListCommunityMembersMethod(), responseObserver);
    }

    /**
     * <pre>
     * Partial update, `update_mask`-driven — same pattern as `ActorService.UpdateProfile`.
     * Requires the caller to be a moderator of the community.
     * </pre>
     */
    default void updateCommunity(patches.v1.Communities.UpdateCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.UpdateCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateCommunityMethod(), responseObserver);
    }

    /**
     * <pre>
     * Promotes/demotes a member between `member` and `moderator`. Requires the caller to be a
     * moderator.
     * </pre>
     */
    default void setCommunityRole(patches.v1.Communities.SetCommunityRoleRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.SetCommunityRoleResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSetCommunityRoleMethod(), responseObserver);
    }

    /**
     * <pre>
     * Moderator-only: detaches a post from the community without deleting the post itself.
     * </pre>
     */
    default void removePostFromCommunity(patches.v1.Communities.RemovePostFromCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.RemovePostFromCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRemovePostFromCommunityMethod(), responseObserver);
    }

    /**
     */
    default void banFromCommunity(patches.v1.Communities.BanFromCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.BanFromCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBanFromCommunityMethod(), responseObserver);
    }

    /**
     * <pre>
     * Rate-limited, block-aware unsolicited-contact vector (spec §188, §192). Never
     * auto-joins the invitee.
     * </pre>
     */
    default void inviteToCommunity(patches.v1.Communities.InviteToCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.InviteToCommunityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getInviteToCommunityMethod(), responseObserver);
    }

    /**
     */
    default void respondToCommunityInvite(patches.v1.Communities.RespondToCommunityInviteRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.RespondToCommunityInviteResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRespondToCommunityInviteMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service CommunityService.
   * <pre>
   * Topical communities a post may optionally belong to (spec §189–190). A community
   * moderator's authority stops at the community boundary (spec §192) — no cross-community
   * power, and every moderation action here is audited (spec §66).
   * </pre>
   */
  public static abstract class CommunityServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return CommunityServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service CommunityService.
   * <pre>
   * Topical communities a post may optionally belong to (spec §189–190). A community
   * moderator's authority stops at the community boundary (spec §192) — no cross-community
   * power, and every moderation action here is audited (spec §66).
   * </pre>
   */
  public static final class CommunityServiceStub
      extends io.grpc.stub.AbstractAsyncStub<CommunityServiceStub> {
    private CommunityServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected CommunityServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new CommunityServiceStub(channel, callOptions);
    }

    /**
     */
    public void createCommunity(patches.v1.Communities.CreateCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.CreateCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getCommunity(patches.v1.Communities.GetCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.GetCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listCommunities(patches.v1.Communities.ListCommunitiesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.ListCommunitiesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListCommunitiesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: joining a community the caller already belongs to is not an error.
     * </pre>
     */
    public void joinCommunity(patches.v1.Communities.JoinCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.JoinCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getJoinCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: leaving a community the caller doesn't belong to is not an error.
     * </pre>
     */
    public void leaveCommunity(patches.v1.Communities.LeaveCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.LeaveCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getLeaveCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listCommunityMembers(patches.v1.Communities.ListCommunityMembersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.ListCommunityMembersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListCommunityMembersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Partial update, `update_mask`-driven — same pattern as `ActorService.UpdateProfile`.
     * Requires the caller to be a moderator of the community.
     * </pre>
     */
    public void updateCommunity(patches.v1.Communities.UpdateCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.UpdateCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Promotes/demotes a member between `member` and `moderator`. Requires the caller to be a
     * moderator.
     * </pre>
     */
    public void setCommunityRole(patches.v1.Communities.SetCommunityRoleRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.SetCommunityRoleResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSetCommunityRoleMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Moderator-only: detaches a post from the community without deleting the post itself.
     * </pre>
     */
    public void removePostFromCommunity(patches.v1.Communities.RemovePostFromCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.RemovePostFromCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRemovePostFromCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void banFromCommunity(patches.v1.Communities.BanFromCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.BanFromCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBanFromCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Rate-limited, block-aware unsolicited-contact vector (spec §188, §192). Never
     * auto-joins the invitee.
     * </pre>
     */
    public void inviteToCommunity(patches.v1.Communities.InviteToCommunityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.InviteToCommunityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getInviteToCommunityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void respondToCommunityInvite(patches.v1.Communities.RespondToCommunityInviteRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Communities.RespondToCommunityInviteResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRespondToCommunityInviteMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service CommunityService.
   * <pre>
   * Topical communities a post may optionally belong to (spec §189–190). A community
   * moderator's authority stops at the community boundary (spec §192) — no cross-community
   * power, and every moderation action here is audited (spec §66).
   * </pre>
   */
  public static final class CommunityServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<CommunityServiceBlockingV2Stub> {
    private CommunityServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected CommunityServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new CommunityServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Communities.CreateCommunityResponse createCommunity(patches.v1.Communities.CreateCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.GetCommunityResponse getCommunity(patches.v1.Communities.GetCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.ListCommunitiesResponse listCommunities(patches.v1.Communities.ListCommunitiesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCommunitiesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: joining a community the caller already belongs to is not an error.
     * </pre>
     */
    public patches.v1.Communities.JoinCommunityResponse joinCommunity(patches.v1.Communities.JoinCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getJoinCommunityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: leaving a community the caller doesn't belong to is not an error.
     * </pre>
     */
    public patches.v1.Communities.LeaveCommunityResponse leaveCommunity(patches.v1.Communities.LeaveCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLeaveCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.ListCommunityMembersResponse listCommunityMembers(patches.v1.Communities.ListCommunityMembersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCommunityMembersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Partial update, `update_mask`-driven — same pattern as `ActorService.UpdateProfile`.
     * Requires the caller to be a moderator of the community.
     * </pre>
     */
    public patches.v1.Communities.UpdateCommunityResponse updateCommunity(patches.v1.Communities.UpdateCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateCommunityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Promotes/demotes a member between `member` and `moderator`. Requires the caller to be a
     * moderator.
     * </pre>
     */
    public patches.v1.Communities.SetCommunityRoleResponse setCommunityRole(patches.v1.Communities.SetCommunityRoleRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetCommunityRoleMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Moderator-only: detaches a post from the community without deleting the post itself.
     * </pre>
     */
    public patches.v1.Communities.RemovePostFromCommunityResponse removePostFromCommunity(patches.v1.Communities.RemovePostFromCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRemovePostFromCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.BanFromCommunityResponse banFromCommunity(patches.v1.Communities.BanFromCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBanFromCommunityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rate-limited, block-aware unsolicited-contact vector (spec §188, §192). Never
     * auto-joins the invitee.
     * </pre>
     */
    public patches.v1.Communities.InviteToCommunityResponse inviteToCommunity(patches.v1.Communities.InviteToCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getInviteToCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.RespondToCommunityInviteResponse respondToCommunityInvite(patches.v1.Communities.RespondToCommunityInviteRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRespondToCommunityInviteMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service CommunityService.
   * <pre>
   * Topical communities a post may optionally belong to (spec §189–190). A community
   * moderator's authority stops at the community boundary (spec §192) — no cross-community
   * power, and every moderation action here is audited (spec §66).
   * </pre>
   */
  public static final class CommunityServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<CommunityServiceBlockingStub> {
    private CommunityServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected CommunityServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new CommunityServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Communities.CreateCommunityResponse createCommunity(patches.v1.Communities.CreateCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.GetCommunityResponse getCommunity(patches.v1.Communities.GetCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.ListCommunitiesResponse listCommunities(patches.v1.Communities.ListCommunitiesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCommunitiesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: joining a community the caller already belongs to is not an error.
     * </pre>
     */
    public patches.v1.Communities.JoinCommunityResponse joinCommunity(patches.v1.Communities.JoinCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getJoinCommunityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: leaving a community the caller doesn't belong to is not an error.
     * </pre>
     */
    public patches.v1.Communities.LeaveCommunityResponse leaveCommunity(patches.v1.Communities.LeaveCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLeaveCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.ListCommunityMembersResponse listCommunityMembers(patches.v1.Communities.ListCommunityMembersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCommunityMembersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Partial update, `update_mask`-driven — same pattern as `ActorService.UpdateProfile`.
     * Requires the caller to be a moderator of the community.
     * </pre>
     */
    public patches.v1.Communities.UpdateCommunityResponse updateCommunity(patches.v1.Communities.UpdateCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateCommunityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Promotes/demotes a member between `member` and `moderator`. Requires the caller to be a
     * moderator.
     * </pre>
     */
    public patches.v1.Communities.SetCommunityRoleResponse setCommunityRole(patches.v1.Communities.SetCommunityRoleRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetCommunityRoleMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Moderator-only: detaches a post from the community without deleting the post itself.
     * </pre>
     */
    public patches.v1.Communities.RemovePostFromCommunityResponse removePostFromCommunity(patches.v1.Communities.RemovePostFromCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRemovePostFromCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.BanFromCommunityResponse banFromCommunity(patches.v1.Communities.BanFromCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBanFromCommunityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rate-limited, block-aware unsolicited-contact vector (spec §188, §192). Never
     * auto-joins the invitee.
     * </pre>
     */
    public patches.v1.Communities.InviteToCommunityResponse inviteToCommunity(patches.v1.Communities.InviteToCommunityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getInviteToCommunityMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Communities.RespondToCommunityInviteResponse respondToCommunityInvite(patches.v1.Communities.RespondToCommunityInviteRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRespondToCommunityInviteMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service CommunityService.
   * <pre>
   * Topical communities a post may optionally belong to (spec §189–190). A community
   * moderator's authority stops at the community boundary (spec §192) — no cross-community
   * power, and every moderation action here is audited (spec §66).
   * </pre>
   */
  public static final class CommunityServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<CommunityServiceFutureStub> {
    private CommunityServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected CommunityServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new CommunityServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.CreateCommunityResponse> createCommunity(
        patches.v1.Communities.CreateCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateCommunityMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.GetCommunityResponse> getCommunity(
        patches.v1.Communities.GetCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetCommunityMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.ListCommunitiesResponse> listCommunities(
        patches.v1.Communities.ListCommunitiesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListCommunitiesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: joining a community the caller already belongs to is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.JoinCommunityResponse> joinCommunity(
        patches.v1.Communities.JoinCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getJoinCommunityMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: leaving a community the caller doesn't belong to is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.LeaveCommunityResponse> leaveCommunity(
        patches.v1.Communities.LeaveCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getLeaveCommunityMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.ListCommunityMembersResponse> listCommunityMembers(
        patches.v1.Communities.ListCommunityMembersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListCommunityMembersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Partial update, `update_mask`-driven — same pattern as `ActorService.UpdateProfile`.
     * Requires the caller to be a moderator of the community.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.UpdateCommunityResponse> updateCommunity(
        patches.v1.Communities.UpdateCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateCommunityMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Promotes/demotes a member between `member` and `moderator`. Requires the caller to be a
     * moderator.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.SetCommunityRoleResponse> setCommunityRole(
        patches.v1.Communities.SetCommunityRoleRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSetCommunityRoleMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Moderator-only: detaches a post from the community without deleting the post itself.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.RemovePostFromCommunityResponse> removePostFromCommunity(
        patches.v1.Communities.RemovePostFromCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRemovePostFromCommunityMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.BanFromCommunityResponse> banFromCommunity(
        patches.v1.Communities.BanFromCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBanFromCommunityMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Rate-limited, block-aware unsolicited-contact vector (spec §188, §192). Never
     * auto-joins the invitee.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.InviteToCommunityResponse> inviteToCommunity(
        patches.v1.Communities.InviteToCommunityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getInviteToCommunityMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Communities.RespondToCommunityInviteResponse> respondToCommunityInvite(
        patches.v1.Communities.RespondToCommunityInviteRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRespondToCommunityInviteMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_CREATE_COMMUNITY = 0;
  private static final int METHODID_GET_COMMUNITY = 1;
  private static final int METHODID_LIST_COMMUNITIES = 2;
  private static final int METHODID_JOIN_COMMUNITY = 3;
  private static final int METHODID_LEAVE_COMMUNITY = 4;
  private static final int METHODID_LIST_COMMUNITY_MEMBERS = 5;
  private static final int METHODID_UPDATE_COMMUNITY = 6;
  private static final int METHODID_SET_COMMUNITY_ROLE = 7;
  private static final int METHODID_REMOVE_POST_FROM_COMMUNITY = 8;
  private static final int METHODID_BAN_FROM_COMMUNITY = 9;
  private static final int METHODID_INVITE_TO_COMMUNITY = 10;
  private static final int METHODID_RESPOND_TO_COMMUNITY_INVITE = 11;

  private static final class MethodHandlers<Req, Resp> implements
      io.grpc.stub.ServerCalls.UnaryMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ServerStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ClientStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.BidiStreamingMethod<Req, Resp> {
    private final AsyncService serviceImpl;
    private final int methodId;

    MethodHandlers(AsyncService serviceImpl, int methodId) {
      this.serviceImpl = serviceImpl;
      this.methodId = methodId;
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public void invoke(Req request, io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        case METHODID_CREATE_COMMUNITY:
          serviceImpl.createCommunity((patches.v1.Communities.CreateCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.CreateCommunityResponse>) responseObserver);
          break;
        case METHODID_GET_COMMUNITY:
          serviceImpl.getCommunity((patches.v1.Communities.GetCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.GetCommunityResponse>) responseObserver);
          break;
        case METHODID_LIST_COMMUNITIES:
          serviceImpl.listCommunities((patches.v1.Communities.ListCommunitiesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.ListCommunitiesResponse>) responseObserver);
          break;
        case METHODID_JOIN_COMMUNITY:
          serviceImpl.joinCommunity((patches.v1.Communities.JoinCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.JoinCommunityResponse>) responseObserver);
          break;
        case METHODID_LEAVE_COMMUNITY:
          serviceImpl.leaveCommunity((patches.v1.Communities.LeaveCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.LeaveCommunityResponse>) responseObserver);
          break;
        case METHODID_LIST_COMMUNITY_MEMBERS:
          serviceImpl.listCommunityMembers((patches.v1.Communities.ListCommunityMembersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.ListCommunityMembersResponse>) responseObserver);
          break;
        case METHODID_UPDATE_COMMUNITY:
          serviceImpl.updateCommunity((patches.v1.Communities.UpdateCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.UpdateCommunityResponse>) responseObserver);
          break;
        case METHODID_SET_COMMUNITY_ROLE:
          serviceImpl.setCommunityRole((patches.v1.Communities.SetCommunityRoleRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.SetCommunityRoleResponse>) responseObserver);
          break;
        case METHODID_REMOVE_POST_FROM_COMMUNITY:
          serviceImpl.removePostFromCommunity((patches.v1.Communities.RemovePostFromCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.RemovePostFromCommunityResponse>) responseObserver);
          break;
        case METHODID_BAN_FROM_COMMUNITY:
          serviceImpl.banFromCommunity((patches.v1.Communities.BanFromCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.BanFromCommunityResponse>) responseObserver);
          break;
        case METHODID_INVITE_TO_COMMUNITY:
          serviceImpl.inviteToCommunity((patches.v1.Communities.InviteToCommunityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.InviteToCommunityResponse>) responseObserver);
          break;
        case METHODID_RESPOND_TO_COMMUNITY_INVITE:
          serviceImpl.respondToCommunityInvite((patches.v1.Communities.RespondToCommunityInviteRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Communities.RespondToCommunityInviteResponse>) responseObserver);
          break;
        default:
          throw new AssertionError();
      }
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public io.grpc.stub.StreamObserver<Req> invoke(
        io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        default:
          throw new AssertionError();
      }
    }
  }

  public static final io.grpc.ServerServiceDefinition bindService(AsyncService service) {
    return io.grpc.ServerServiceDefinition.builder(getServiceDescriptor())
        .addMethod(
          getCreateCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.CreateCommunityRequest,
              patches.v1.Communities.CreateCommunityResponse>(
                service, METHODID_CREATE_COMMUNITY)))
        .addMethod(
          getGetCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.GetCommunityRequest,
              patches.v1.Communities.GetCommunityResponse>(
                service, METHODID_GET_COMMUNITY)))
        .addMethod(
          getListCommunitiesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.ListCommunitiesRequest,
              patches.v1.Communities.ListCommunitiesResponse>(
                service, METHODID_LIST_COMMUNITIES)))
        .addMethod(
          getJoinCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.JoinCommunityRequest,
              patches.v1.Communities.JoinCommunityResponse>(
                service, METHODID_JOIN_COMMUNITY)))
        .addMethod(
          getLeaveCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.LeaveCommunityRequest,
              patches.v1.Communities.LeaveCommunityResponse>(
                service, METHODID_LEAVE_COMMUNITY)))
        .addMethod(
          getListCommunityMembersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.ListCommunityMembersRequest,
              patches.v1.Communities.ListCommunityMembersResponse>(
                service, METHODID_LIST_COMMUNITY_MEMBERS)))
        .addMethod(
          getUpdateCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.UpdateCommunityRequest,
              patches.v1.Communities.UpdateCommunityResponse>(
                service, METHODID_UPDATE_COMMUNITY)))
        .addMethod(
          getSetCommunityRoleMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.SetCommunityRoleRequest,
              patches.v1.Communities.SetCommunityRoleResponse>(
                service, METHODID_SET_COMMUNITY_ROLE)))
        .addMethod(
          getRemovePostFromCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.RemovePostFromCommunityRequest,
              patches.v1.Communities.RemovePostFromCommunityResponse>(
                service, METHODID_REMOVE_POST_FROM_COMMUNITY)))
        .addMethod(
          getBanFromCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.BanFromCommunityRequest,
              patches.v1.Communities.BanFromCommunityResponse>(
                service, METHODID_BAN_FROM_COMMUNITY)))
        .addMethod(
          getInviteToCommunityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.InviteToCommunityRequest,
              patches.v1.Communities.InviteToCommunityResponse>(
                service, METHODID_INVITE_TO_COMMUNITY)))
        .addMethod(
          getRespondToCommunityInviteMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Communities.RespondToCommunityInviteRequest,
              patches.v1.Communities.RespondToCommunityInviteResponse>(
                service, METHODID_RESPOND_TO_COMMUNITY_INVITE)))
        .build();
  }

  private static abstract class CommunityServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    CommunityServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Communities.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("CommunityService");
    }
  }

  private static final class CommunityServiceFileDescriptorSupplier
      extends CommunityServiceBaseDescriptorSupplier {
    CommunityServiceFileDescriptorSupplier() {}
  }

  private static final class CommunityServiceMethodDescriptorSupplier
      extends CommunityServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    CommunityServiceMethodDescriptorSupplier(java.lang.String methodName) {
      this.methodName = methodName;
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.MethodDescriptor getMethodDescriptor() {
      return getServiceDescriptor().findMethodByName(methodName);
    }
  }

  private static volatile io.grpc.ServiceDescriptor serviceDescriptor;

  public static io.grpc.ServiceDescriptor getServiceDescriptor() {
    io.grpc.ServiceDescriptor result = serviceDescriptor;
    if (result == null) {
      synchronized (CommunityServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new CommunityServiceFileDescriptorSupplier())
              .addMethod(getCreateCommunityMethod())
              .addMethod(getGetCommunityMethod())
              .addMethod(getListCommunitiesMethod())
              .addMethod(getJoinCommunityMethod())
              .addMethod(getLeaveCommunityMethod())
              .addMethod(getListCommunityMembersMethod())
              .addMethod(getUpdateCommunityMethod())
              .addMethod(getSetCommunityRoleMethod())
              .addMethod(getRemovePostFromCommunityMethod())
              .addMethod(getBanFromCommunityMethod())
              .addMethod(getInviteToCommunityMethod())
              .addMethod(getRespondToCommunityInviteMethod())
              .build();
        }
      }
    }
    return result;
  }
}
