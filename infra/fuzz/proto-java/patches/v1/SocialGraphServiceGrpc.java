package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Follows and the block/mute-aware relationship view (spec §50, §61–63, Amendment C §197.5).
 * `blocks`/`mutes` exist as database tables from Phase 3 on because the feed visibility SQL
 * needs them (§59), but `BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are user-facing
 * RPCs deferred to Phase 6 (spec §140) — not part of this service yet.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/social_graph.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class SocialGraphServiceGrpc {

  private SocialGraphServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.SocialGraphService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.SocialGraph.FollowActorRequest,
      patches.v1.SocialGraph.FollowActorResponse> getFollowActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "FollowActor",
      requestType = patches.v1.SocialGraph.FollowActorRequest.class,
      responseType = patches.v1.SocialGraph.FollowActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.SocialGraph.FollowActorRequest,
      patches.v1.SocialGraph.FollowActorResponse> getFollowActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.SocialGraph.FollowActorRequest, patches.v1.SocialGraph.FollowActorResponse> getFollowActorMethod;
    if ((getFollowActorMethod = SocialGraphServiceGrpc.getFollowActorMethod) == null) {
      synchronized (SocialGraphServiceGrpc.class) {
        if ((getFollowActorMethod = SocialGraphServiceGrpc.getFollowActorMethod) == null) {
          SocialGraphServiceGrpc.getFollowActorMethod = getFollowActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.SocialGraph.FollowActorRequest, patches.v1.SocialGraph.FollowActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "FollowActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.FollowActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.FollowActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SocialGraphServiceMethodDescriptorSupplier("FollowActor"))
              .build();
        }
      }
    }
    return getFollowActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.SocialGraph.UnfollowActorRequest,
      patches.v1.SocialGraph.UnfollowActorResponse> getUnfollowActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnfollowActor",
      requestType = patches.v1.SocialGraph.UnfollowActorRequest.class,
      responseType = patches.v1.SocialGraph.UnfollowActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.SocialGraph.UnfollowActorRequest,
      patches.v1.SocialGraph.UnfollowActorResponse> getUnfollowActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.SocialGraph.UnfollowActorRequest, patches.v1.SocialGraph.UnfollowActorResponse> getUnfollowActorMethod;
    if ((getUnfollowActorMethod = SocialGraphServiceGrpc.getUnfollowActorMethod) == null) {
      synchronized (SocialGraphServiceGrpc.class) {
        if ((getUnfollowActorMethod = SocialGraphServiceGrpc.getUnfollowActorMethod) == null) {
          SocialGraphServiceGrpc.getUnfollowActorMethod = getUnfollowActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.SocialGraph.UnfollowActorRequest, patches.v1.SocialGraph.UnfollowActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnfollowActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.UnfollowActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.UnfollowActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SocialGraphServiceMethodDescriptorSupplier("UnfollowActor"))
              .build();
        }
      }
    }
    return getUnfollowActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.SocialGraph.GetRelationshipRequest,
      patches.v1.SocialGraph.GetRelationshipResponse> getGetRelationshipMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetRelationship",
      requestType = patches.v1.SocialGraph.GetRelationshipRequest.class,
      responseType = patches.v1.SocialGraph.GetRelationshipResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.SocialGraph.GetRelationshipRequest,
      patches.v1.SocialGraph.GetRelationshipResponse> getGetRelationshipMethod() {
    io.grpc.MethodDescriptor<patches.v1.SocialGraph.GetRelationshipRequest, patches.v1.SocialGraph.GetRelationshipResponse> getGetRelationshipMethod;
    if ((getGetRelationshipMethod = SocialGraphServiceGrpc.getGetRelationshipMethod) == null) {
      synchronized (SocialGraphServiceGrpc.class) {
        if ((getGetRelationshipMethod = SocialGraphServiceGrpc.getGetRelationshipMethod) == null) {
          SocialGraphServiceGrpc.getGetRelationshipMethod = getGetRelationshipMethod =
              io.grpc.MethodDescriptor.<patches.v1.SocialGraph.GetRelationshipRequest, patches.v1.SocialGraph.GetRelationshipResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetRelationship"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.GetRelationshipRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.GetRelationshipResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SocialGraphServiceMethodDescriptorSupplier("GetRelationship"))
              .build();
        }
      }
    }
    return getGetRelationshipMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.SocialGraph.ListMutualFollowsRequest,
      patches.v1.SocialGraph.ListMutualFollowsResponse> getListMutualFollowsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListMutualFollows",
      requestType = patches.v1.SocialGraph.ListMutualFollowsRequest.class,
      responseType = patches.v1.SocialGraph.ListMutualFollowsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.SocialGraph.ListMutualFollowsRequest,
      patches.v1.SocialGraph.ListMutualFollowsResponse> getListMutualFollowsMethod() {
    io.grpc.MethodDescriptor<patches.v1.SocialGraph.ListMutualFollowsRequest, patches.v1.SocialGraph.ListMutualFollowsResponse> getListMutualFollowsMethod;
    if ((getListMutualFollowsMethod = SocialGraphServiceGrpc.getListMutualFollowsMethod) == null) {
      synchronized (SocialGraphServiceGrpc.class) {
        if ((getListMutualFollowsMethod = SocialGraphServiceGrpc.getListMutualFollowsMethod) == null) {
          SocialGraphServiceGrpc.getListMutualFollowsMethod = getListMutualFollowsMethod =
              io.grpc.MethodDescriptor.<patches.v1.SocialGraph.ListMutualFollowsRequest, patches.v1.SocialGraph.ListMutualFollowsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListMutualFollows"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.ListMutualFollowsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.ListMutualFollowsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SocialGraphServiceMethodDescriptorSupplier("ListMutualFollows"))
              .build();
        }
      }
    }
    return getListMutualFollowsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.SocialGraph.ListFollowRequestsRequest,
      patches.v1.SocialGraph.ListFollowRequestsResponse> getListFollowRequestsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListFollowRequests",
      requestType = patches.v1.SocialGraph.ListFollowRequestsRequest.class,
      responseType = patches.v1.SocialGraph.ListFollowRequestsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.SocialGraph.ListFollowRequestsRequest,
      patches.v1.SocialGraph.ListFollowRequestsResponse> getListFollowRequestsMethod() {
    io.grpc.MethodDescriptor<patches.v1.SocialGraph.ListFollowRequestsRequest, patches.v1.SocialGraph.ListFollowRequestsResponse> getListFollowRequestsMethod;
    if ((getListFollowRequestsMethod = SocialGraphServiceGrpc.getListFollowRequestsMethod) == null) {
      synchronized (SocialGraphServiceGrpc.class) {
        if ((getListFollowRequestsMethod = SocialGraphServiceGrpc.getListFollowRequestsMethod) == null) {
          SocialGraphServiceGrpc.getListFollowRequestsMethod = getListFollowRequestsMethod =
              io.grpc.MethodDescriptor.<patches.v1.SocialGraph.ListFollowRequestsRequest, patches.v1.SocialGraph.ListFollowRequestsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListFollowRequests"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.ListFollowRequestsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.ListFollowRequestsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SocialGraphServiceMethodDescriptorSupplier("ListFollowRequests"))
              .build();
        }
      }
    }
    return getListFollowRequestsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.SocialGraph.AcceptFollowRequestRequest,
      patches.v1.SocialGraph.AcceptFollowRequestResponse> getAcceptFollowRequestMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AcceptFollowRequest",
      requestType = patches.v1.SocialGraph.AcceptFollowRequestRequest.class,
      responseType = patches.v1.SocialGraph.AcceptFollowRequestResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.SocialGraph.AcceptFollowRequestRequest,
      patches.v1.SocialGraph.AcceptFollowRequestResponse> getAcceptFollowRequestMethod() {
    io.grpc.MethodDescriptor<patches.v1.SocialGraph.AcceptFollowRequestRequest, patches.v1.SocialGraph.AcceptFollowRequestResponse> getAcceptFollowRequestMethod;
    if ((getAcceptFollowRequestMethod = SocialGraphServiceGrpc.getAcceptFollowRequestMethod) == null) {
      synchronized (SocialGraphServiceGrpc.class) {
        if ((getAcceptFollowRequestMethod = SocialGraphServiceGrpc.getAcceptFollowRequestMethod) == null) {
          SocialGraphServiceGrpc.getAcceptFollowRequestMethod = getAcceptFollowRequestMethod =
              io.grpc.MethodDescriptor.<patches.v1.SocialGraph.AcceptFollowRequestRequest, patches.v1.SocialGraph.AcceptFollowRequestResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AcceptFollowRequest"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.AcceptFollowRequestRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.AcceptFollowRequestResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SocialGraphServiceMethodDescriptorSupplier("AcceptFollowRequest"))
              .build();
        }
      }
    }
    return getAcceptFollowRequestMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.SocialGraph.RejectFollowRequestRequest,
      patches.v1.SocialGraph.RejectFollowRequestResponse> getRejectFollowRequestMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RejectFollowRequest",
      requestType = patches.v1.SocialGraph.RejectFollowRequestRequest.class,
      responseType = patches.v1.SocialGraph.RejectFollowRequestResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.SocialGraph.RejectFollowRequestRequest,
      patches.v1.SocialGraph.RejectFollowRequestResponse> getRejectFollowRequestMethod() {
    io.grpc.MethodDescriptor<patches.v1.SocialGraph.RejectFollowRequestRequest, patches.v1.SocialGraph.RejectFollowRequestResponse> getRejectFollowRequestMethod;
    if ((getRejectFollowRequestMethod = SocialGraphServiceGrpc.getRejectFollowRequestMethod) == null) {
      synchronized (SocialGraphServiceGrpc.class) {
        if ((getRejectFollowRequestMethod = SocialGraphServiceGrpc.getRejectFollowRequestMethod) == null) {
          SocialGraphServiceGrpc.getRejectFollowRequestMethod = getRejectFollowRequestMethod =
              io.grpc.MethodDescriptor.<patches.v1.SocialGraph.RejectFollowRequestRequest, patches.v1.SocialGraph.RejectFollowRequestResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RejectFollowRequest"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.RejectFollowRequestRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.SocialGraph.RejectFollowRequestResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SocialGraphServiceMethodDescriptorSupplier("RejectFollowRequest"))
              .build();
        }
      }
    }
    return getRejectFollowRequestMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static SocialGraphServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceStub>() {
        @java.lang.Override
        public SocialGraphServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SocialGraphServiceStub(channel, callOptions);
        }
      };
    return SocialGraphServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static SocialGraphServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceBlockingV2Stub>() {
        @java.lang.Override
        public SocialGraphServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SocialGraphServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return SocialGraphServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static SocialGraphServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceBlockingStub>() {
        @java.lang.Override
        public SocialGraphServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SocialGraphServiceBlockingStub(channel, callOptions);
        }
      };
    return SocialGraphServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static SocialGraphServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SocialGraphServiceFutureStub>() {
        @java.lang.Override
        public SocialGraphServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SocialGraphServiceFutureStub(channel, callOptions);
        }
      };
    return SocialGraphServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Follows and the block/mute-aware relationship view (spec §50, §61–63, Amendment C §197.5).
   * `blocks`/`mutes` exist as database tables from Phase 3 on because the feed visibility SQL
   * needs them (§59), but `BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are user-facing
   * RPCs deferred to Phase 6 (spec §140) — not part of this service yet.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * v0 local accounts transition straight to `FOLLOW_STATE_FOLLOWING` (spec §50) — *unless*
     * the target is a locked local actor (§197.5), in which case this creates a pending follow
     * request instead (`FollowActorResponse.requested = true`) and never a `follows` row.
     * Rejects a follow in either direction of an existing block. Idempotent either way: calling
     * this again while already following, or while a request is already pending, is a no-op.
     * </pre>
     */
    default void followActor(patches.v1.SocialGraph.FollowActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.FollowActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getFollowActorMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unfollowing an actor the caller does not follow is not an error. Also cancels
     * a pending follow request the caller has outstanding toward `actor_id` (§197.5) — this is
     * the RPC a client calls for "cancel my follow request", too.
     * </pre>
     */
    default void unfollowActor(patches.v1.SocialGraph.UnfollowActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.UnfollowActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnfollowActorMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's relationship with `actor_id` — requires an authenticated session, since there
     * is no relationship to report for an anonymous caller.
     * </pre>
     */
    default void getRelationship(patches.v1.SocialGraph.GetRelationshipRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.GetRelationshipResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetRelationshipMethod(), responseObserver);
    }

    /**
     * <pre>
     * B-024: actors `actor_id` both follows and is followed by ("mutuals"/"friends") — the RPC
     * the TUI's `PageScreen` Friends block needs (previously a documented "[friends list
     * unavailable]" placeholder). Anonymous-readable, unlike this service's other RPCs: mutuality
     * is always computed relative to `actor_id`, never the caller's own identity, and a public
     * Page's Friends block must be visible to a signed-out visitor.
     * </pre>
     */
    default void listMutualFollows(patches.v1.SocialGraph.ListMutualFollowsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.ListMutualFollowsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListMutualFollowsMethod(), responseObserver);
    }

    /**
     * <pre>
     * §197.5: pending follow requests addressed to the caller's own (locked) account, newest
     * first. Requires an authenticated session — there is no one else's request queue to list.
     * </pre>
     */
    default void listFollowRequests(patches.v1.SocialGraph.ListFollowRequestsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.ListFollowRequestsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListFollowRequestsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Accepts a pending follow request from `actor_id` addressed to the caller: creates the
     * `FOLLOWING` edge and removes the request. `FOLLOW_REQUEST_NOT_FOUND` if no such pending
     * request exists.
     * </pre>
     */
    default void acceptFollowRequest(patches.v1.SocialGraph.AcceptFollowRequestRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.AcceptFollowRequestResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAcceptFollowRequestMethod(), responseObserver);
    }

    /**
     * <pre>
     * Rejects (discards) a pending follow request from `actor_id` addressed to the caller — no
     * `follows` row is ever created. `FOLLOW_REQUEST_NOT_FOUND` if no such pending request
     * exists.
     * </pre>
     */
    default void rejectFollowRequest(patches.v1.SocialGraph.RejectFollowRequestRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.RejectFollowRequestResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRejectFollowRequestMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service SocialGraphService.
   * <pre>
   * Follows and the block/mute-aware relationship view (spec §50, §61–63, Amendment C §197.5).
   * `blocks`/`mutes` exist as database tables from Phase 3 on because the feed visibility SQL
   * needs them (§59), but `BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are user-facing
   * RPCs deferred to Phase 6 (spec §140) — not part of this service yet.
   * </pre>
   */
  public static abstract class SocialGraphServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return SocialGraphServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service SocialGraphService.
   * <pre>
   * Follows and the block/mute-aware relationship view (spec §50, §61–63, Amendment C §197.5).
   * `blocks`/`mutes` exist as database tables from Phase 3 on because the feed visibility SQL
   * needs them (§59), but `BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are user-facing
   * RPCs deferred to Phase 6 (spec §140) — not part of this service yet.
   * </pre>
   */
  public static final class SocialGraphServiceStub
      extends io.grpc.stub.AbstractAsyncStub<SocialGraphServiceStub> {
    private SocialGraphServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SocialGraphServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SocialGraphServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * v0 local accounts transition straight to `FOLLOW_STATE_FOLLOWING` (spec §50) — *unless*
     * the target is a locked local actor (§197.5), in which case this creates a pending follow
     * request instead (`FollowActorResponse.requested = true`) and never a `follows` row.
     * Rejects a follow in either direction of an existing block. Idempotent either way: calling
     * this again while already following, or while a request is already pending, is a no-op.
     * </pre>
     */
    public void followActor(patches.v1.SocialGraph.FollowActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.FollowActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getFollowActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unfollowing an actor the caller does not follow is not an error. Also cancels
     * a pending follow request the caller has outstanding toward `actor_id` (§197.5) — this is
     * the RPC a client calls for "cancel my follow request", too.
     * </pre>
     */
    public void unfollowActor(patches.v1.SocialGraph.UnfollowActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.UnfollowActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnfollowActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's relationship with `actor_id` — requires an authenticated session, since there
     * is no relationship to report for an anonymous caller.
     * </pre>
     */
    public void getRelationship(patches.v1.SocialGraph.GetRelationshipRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.GetRelationshipResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetRelationshipMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * B-024: actors `actor_id` both follows and is followed by ("mutuals"/"friends") — the RPC
     * the TUI's `PageScreen` Friends block needs (previously a documented "[friends list
     * unavailable]" placeholder). Anonymous-readable, unlike this service's other RPCs: mutuality
     * is always computed relative to `actor_id`, never the caller's own identity, and a public
     * Page's Friends block must be visible to a signed-out visitor.
     * </pre>
     */
    public void listMutualFollows(patches.v1.SocialGraph.ListMutualFollowsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.ListMutualFollowsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListMutualFollowsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * §197.5: pending follow requests addressed to the caller's own (locked) account, newest
     * first. Requires an authenticated session — there is no one else's request queue to list.
     * </pre>
     */
    public void listFollowRequests(patches.v1.SocialGraph.ListFollowRequestsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.ListFollowRequestsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListFollowRequestsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Accepts a pending follow request from `actor_id` addressed to the caller: creates the
     * `FOLLOWING` edge and removes the request. `FOLLOW_REQUEST_NOT_FOUND` if no such pending
     * request exists.
     * </pre>
     */
    public void acceptFollowRequest(patches.v1.SocialGraph.AcceptFollowRequestRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.AcceptFollowRequestResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAcceptFollowRequestMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Rejects (discards) a pending follow request from `actor_id` addressed to the caller — no
     * `follows` row is ever created. `FOLLOW_REQUEST_NOT_FOUND` if no such pending request
     * exists.
     * </pre>
     */
    public void rejectFollowRequest(patches.v1.SocialGraph.RejectFollowRequestRequest request,
        io.grpc.stub.StreamObserver<patches.v1.SocialGraph.RejectFollowRequestResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRejectFollowRequestMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service SocialGraphService.
   * <pre>
   * Follows and the block/mute-aware relationship view (spec §50, §61–63, Amendment C §197.5).
   * `blocks`/`mutes` exist as database tables from Phase 3 on because the feed visibility SQL
   * needs them (§59), but `BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are user-facing
   * RPCs deferred to Phase 6 (spec §140) — not part of this service yet.
   * </pre>
   */
  public static final class SocialGraphServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<SocialGraphServiceBlockingV2Stub> {
    private SocialGraphServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SocialGraphServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SocialGraphServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * v0 local accounts transition straight to `FOLLOW_STATE_FOLLOWING` (spec §50) — *unless*
     * the target is a locked local actor (§197.5), in which case this creates a pending follow
     * request instead (`FollowActorResponse.requested = true`) and never a `follows` row.
     * Rejects a follow in either direction of an existing block. Idempotent either way: calling
     * this again while already following, or while a request is already pending, is a no-op.
     * </pre>
     */
    public patches.v1.SocialGraph.FollowActorResponse followActor(patches.v1.SocialGraph.FollowActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFollowActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unfollowing an actor the caller does not follow is not an error. Also cancels
     * a pending follow request the caller has outstanding toward `actor_id` (§197.5) — this is
     * the RPC a client calls for "cancel my follow request", too.
     * </pre>
     */
    public patches.v1.SocialGraph.UnfollowActorResponse unfollowActor(patches.v1.SocialGraph.UnfollowActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnfollowActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's relationship with `actor_id` — requires an authenticated session, since there
     * is no relationship to report for an anonymous caller.
     * </pre>
     */
    public patches.v1.SocialGraph.GetRelationshipResponse getRelationship(patches.v1.SocialGraph.GetRelationshipRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetRelationshipMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * B-024: actors `actor_id` both follows and is followed by ("mutuals"/"friends") — the RPC
     * the TUI's `PageScreen` Friends block needs (previously a documented "[friends list
     * unavailable]" placeholder). Anonymous-readable, unlike this service's other RPCs: mutuality
     * is always computed relative to `actor_id`, never the caller's own identity, and a public
     * Page's Friends block must be visible to a signed-out visitor.
     * </pre>
     */
    public patches.v1.SocialGraph.ListMutualFollowsResponse listMutualFollows(patches.v1.SocialGraph.ListMutualFollowsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMutualFollowsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * §197.5: pending follow requests addressed to the caller's own (locked) account, newest
     * first. Requires an authenticated session — there is no one else's request queue to list.
     * </pre>
     */
    public patches.v1.SocialGraph.ListFollowRequestsResponse listFollowRequests(patches.v1.SocialGraph.ListFollowRequestsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFollowRequestsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Accepts a pending follow request from `actor_id` addressed to the caller: creates the
     * `FOLLOWING` edge and removes the request. `FOLLOW_REQUEST_NOT_FOUND` if no such pending
     * request exists.
     * </pre>
     */
    public patches.v1.SocialGraph.AcceptFollowRequestResponse acceptFollowRequest(patches.v1.SocialGraph.AcceptFollowRequestRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAcceptFollowRequestMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rejects (discards) a pending follow request from `actor_id` addressed to the caller — no
     * `follows` row is ever created. `FOLLOW_REQUEST_NOT_FOUND` if no such pending request
     * exists.
     * </pre>
     */
    public patches.v1.SocialGraph.RejectFollowRequestResponse rejectFollowRequest(patches.v1.SocialGraph.RejectFollowRequestRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRejectFollowRequestMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service SocialGraphService.
   * <pre>
   * Follows and the block/mute-aware relationship view (spec §50, §61–63, Amendment C §197.5).
   * `blocks`/`mutes` exist as database tables from Phase 3 on because the feed visibility SQL
   * needs them (§59), but `BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are user-facing
   * RPCs deferred to Phase 6 (spec §140) — not part of this service yet.
   * </pre>
   */
  public static final class SocialGraphServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<SocialGraphServiceBlockingStub> {
    private SocialGraphServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SocialGraphServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SocialGraphServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * v0 local accounts transition straight to `FOLLOW_STATE_FOLLOWING` (spec §50) — *unless*
     * the target is a locked local actor (§197.5), in which case this creates a pending follow
     * request instead (`FollowActorResponse.requested = true`) and never a `follows` row.
     * Rejects a follow in either direction of an existing block. Idempotent either way: calling
     * this again while already following, or while a request is already pending, is a no-op.
     * </pre>
     */
    public patches.v1.SocialGraph.FollowActorResponse followActor(patches.v1.SocialGraph.FollowActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFollowActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unfollowing an actor the caller does not follow is not an error. Also cancels
     * a pending follow request the caller has outstanding toward `actor_id` (§197.5) — this is
     * the RPC a client calls for "cancel my follow request", too.
     * </pre>
     */
    public patches.v1.SocialGraph.UnfollowActorResponse unfollowActor(patches.v1.SocialGraph.UnfollowActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnfollowActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's relationship with `actor_id` — requires an authenticated session, since there
     * is no relationship to report for an anonymous caller.
     * </pre>
     */
    public patches.v1.SocialGraph.GetRelationshipResponse getRelationship(patches.v1.SocialGraph.GetRelationshipRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetRelationshipMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * B-024: actors `actor_id` both follows and is followed by ("mutuals"/"friends") — the RPC
     * the TUI's `PageScreen` Friends block needs (previously a documented "[friends list
     * unavailable]" placeholder). Anonymous-readable, unlike this service's other RPCs: mutuality
     * is always computed relative to `actor_id`, never the caller's own identity, and a public
     * Page's Friends block must be visible to a signed-out visitor.
     * </pre>
     */
    public patches.v1.SocialGraph.ListMutualFollowsResponse listMutualFollows(patches.v1.SocialGraph.ListMutualFollowsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMutualFollowsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * §197.5: pending follow requests addressed to the caller's own (locked) account, newest
     * first. Requires an authenticated session — there is no one else's request queue to list.
     * </pre>
     */
    public patches.v1.SocialGraph.ListFollowRequestsResponse listFollowRequests(patches.v1.SocialGraph.ListFollowRequestsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFollowRequestsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Accepts a pending follow request from `actor_id` addressed to the caller: creates the
     * `FOLLOWING` edge and removes the request. `FOLLOW_REQUEST_NOT_FOUND` if no such pending
     * request exists.
     * </pre>
     */
    public patches.v1.SocialGraph.AcceptFollowRequestResponse acceptFollowRequest(patches.v1.SocialGraph.AcceptFollowRequestRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAcceptFollowRequestMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rejects (discards) a pending follow request from `actor_id` addressed to the caller — no
     * `follows` row is ever created. `FOLLOW_REQUEST_NOT_FOUND` if no such pending request
     * exists.
     * </pre>
     */
    public patches.v1.SocialGraph.RejectFollowRequestResponse rejectFollowRequest(patches.v1.SocialGraph.RejectFollowRequestRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRejectFollowRequestMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service SocialGraphService.
   * <pre>
   * Follows and the block/mute-aware relationship view (spec §50, §61–63, Amendment C §197.5).
   * `blocks`/`mutes` exist as database tables from Phase 3 on because the feed visibility SQL
   * needs them (§59), but `BlockActor`/`UnblockActor`/`MuteActor`/`UnmuteActor` are user-facing
   * RPCs deferred to Phase 6 (spec §140) — not part of this service yet.
   * </pre>
   */
  public static final class SocialGraphServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<SocialGraphServiceFutureStub> {
    private SocialGraphServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SocialGraphServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SocialGraphServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * v0 local accounts transition straight to `FOLLOW_STATE_FOLLOWING` (spec §50) — *unless*
     * the target is a locked local actor (§197.5), in which case this creates a pending follow
     * request instead (`FollowActorResponse.requested = true`) and never a `follows` row.
     * Rejects a follow in either direction of an existing block. Idempotent either way: calling
     * this again while already following, or while a request is already pending, is a no-op.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.SocialGraph.FollowActorResponse> followActor(
        patches.v1.SocialGraph.FollowActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getFollowActorMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unfollowing an actor the caller does not follow is not an error. Also cancels
     * a pending follow request the caller has outstanding toward `actor_id` (§197.5) — this is
     * the RPC a client calls for "cancel my follow request", too.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.SocialGraph.UnfollowActorResponse> unfollowActor(
        patches.v1.SocialGraph.UnfollowActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnfollowActorMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's relationship with `actor_id` — requires an authenticated session, since there
     * is no relationship to report for an anonymous caller.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.SocialGraph.GetRelationshipResponse> getRelationship(
        patches.v1.SocialGraph.GetRelationshipRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetRelationshipMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * B-024: actors `actor_id` both follows and is followed by ("mutuals"/"friends") — the RPC
     * the TUI's `PageScreen` Friends block needs (previously a documented "[friends list
     * unavailable]" placeholder). Anonymous-readable, unlike this service's other RPCs: mutuality
     * is always computed relative to `actor_id`, never the caller's own identity, and a public
     * Page's Friends block must be visible to a signed-out visitor.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.SocialGraph.ListMutualFollowsResponse> listMutualFollows(
        patches.v1.SocialGraph.ListMutualFollowsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListMutualFollowsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * §197.5: pending follow requests addressed to the caller's own (locked) account, newest
     * first. Requires an authenticated session — there is no one else's request queue to list.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.SocialGraph.ListFollowRequestsResponse> listFollowRequests(
        patches.v1.SocialGraph.ListFollowRequestsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListFollowRequestsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Accepts a pending follow request from `actor_id` addressed to the caller: creates the
     * `FOLLOWING` edge and removes the request. `FOLLOW_REQUEST_NOT_FOUND` if no such pending
     * request exists.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.SocialGraph.AcceptFollowRequestResponse> acceptFollowRequest(
        patches.v1.SocialGraph.AcceptFollowRequestRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAcceptFollowRequestMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Rejects (discards) a pending follow request from `actor_id` addressed to the caller — no
     * `follows` row is ever created. `FOLLOW_REQUEST_NOT_FOUND` if no such pending request
     * exists.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.SocialGraph.RejectFollowRequestResponse> rejectFollowRequest(
        patches.v1.SocialGraph.RejectFollowRequestRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRejectFollowRequestMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_FOLLOW_ACTOR = 0;
  private static final int METHODID_UNFOLLOW_ACTOR = 1;
  private static final int METHODID_GET_RELATIONSHIP = 2;
  private static final int METHODID_LIST_MUTUAL_FOLLOWS = 3;
  private static final int METHODID_LIST_FOLLOW_REQUESTS = 4;
  private static final int METHODID_ACCEPT_FOLLOW_REQUEST = 5;
  private static final int METHODID_REJECT_FOLLOW_REQUEST = 6;

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
        case METHODID_FOLLOW_ACTOR:
          serviceImpl.followActor((patches.v1.SocialGraph.FollowActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.SocialGraph.FollowActorResponse>) responseObserver);
          break;
        case METHODID_UNFOLLOW_ACTOR:
          serviceImpl.unfollowActor((patches.v1.SocialGraph.UnfollowActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.SocialGraph.UnfollowActorResponse>) responseObserver);
          break;
        case METHODID_GET_RELATIONSHIP:
          serviceImpl.getRelationship((patches.v1.SocialGraph.GetRelationshipRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.SocialGraph.GetRelationshipResponse>) responseObserver);
          break;
        case METHODID_LIST_MUTUAL_FOLLOWS:
          serviceImpl.listMutualFollows((patches.v1.SocialGraph.ListMutualFollowsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.SocialGraph.ListMutualFollowsResponse>) responseObserver);
          break;
        case METHODID_LIST_FOLLOW_REQUESTS:
          serviceImpl.listFollowRequests((patches.v1.SocialGraph.ListFollowRequestsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.SocialGraph.ListFollowRequestsResponse>) responseObserver);
          break;
        case METHODID_ACCEPT_FOLLOW_REQUEST:
          serviceImpl.acceptFollowRequest((patches.v1.SocialGraph.AcceptFollowRequestRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.SocialGraph.AcceptFollowRequestResponse>) responseObserver);
          break;
        case METHODID_REJECT_FOLLOW_REQUEST:
          serviceImpl.rejectFollowRequest((patches.v1.SocialGraph.RejectFollowRequestRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.SocialGraph.RejectFollowRequestResponse>) responseObserver);
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
          getFollowActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.SocialGraph.FollowActorRequest,
              patches.v1.SocialGraph.FollowActorResponse>(
                service, METHODID_FOLLOW_ACTOR)))
        .addMethod(
          getUnfollowActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.SocialGraph.UnfollowActorRequest,
              patches.v1.SocialGraph.UnfollowActorResponse>(
                service, METHODID_UNFOLLOW_ACTOR)))
        .addMethod(
          getGetRelationshipMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.SocialGraph.GetRelationshipRequest,
              patches.v1.SocialGraph.GetRelationshipResponse>(
                service, METHODID_GET_RELATIONSHIP)))
        .addMethod(
          getListMutualFollowsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.SocialGraph.ListMutualFollowsRequest,
              patches.v1.SocialGraph.ListMutualFollowsResponse>(
                service, METHODID_LIST_MUTUAL_FOLLOWS)))
        .addMethod(
          getListFollowRequestsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.SocialGraph.ListFollowRequestsRequest,
              patches.v1.SocialGraph.ListFollowRequestsResponse>(
                service, METHODID_LIST_FOLLOW_REQUESTS)))
        .addMethod(
          getAcceptFollowRequestMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.SocialGraph.AcceptFollowRequestRequest,
              patches.v1.SocialGraph.AcceptFollowRequestResponse>(
                service, METHODID_ACCEPT_FOLLOW_REQUEST)))
        .addMethod(
          getRejectFollowRequestMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.SocialGraph.RejectFollowRequestRequest,
              patches.v1.SocialGraph.RejectFollowRequestResponse>(
                service, METHODID_REJECT_FOLLOW_REQUEST)))
        .build();
  }

  private static abstract class SocialGraphServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    SocialGraphServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.SocialGraph.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("SocialGraphService");
    }
  }

  private static final class SocialGraphServiceFileDescriptorSupplier
      extends SocialGraphServiceBaseDescriptorSupplier {
    SocialGraphServiceFileDescriptorSupplier() {}
  }

  private static final class SocialGraphServiceMethodDescriptorSupplier
      extends SocialGraphServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    SocialGraphServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (SocialGraphServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new SocialGraphServiceFileDescriptorSupplier())
              .addMethod(getFollowActorMethod())
              .addMethod(getUnfollowActorMethod())
              .addMethod(getGetRelationshipMethod())
              .addMethod(getListMutualFollowsMethod())
              .addMethod(getListFollowRequestsMethod())
              .addMethod(getAcceptFollowRequestMethod())
              .addMethod(getRejectFollowRequestMethod())
              .build();
        }
      }
    }
    return result;
  }
}
