package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Social identities: local accounts today, remote (federated) actors later (spec §19, §21,
 * §49). `ActorService` never exposes credentials — that is `AuthService`'s job (spec §165).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/actors.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class ActorServiceGrpc {

  private ActorServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.ActorService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Actors.GetActorRequest,
      patches.v1.Actors.GetActorResponse> getGetActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetActor",
      requestType = patches.v1.Actors.GetActorRequest.class,
      responseType = patches.v1.Actors.GetActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Actors.GetActorRequest,
      patches.v1.Actors.GetActorResponse> getGetActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.Actors.GetActorRequest, patches.v1.Actors.GetActorResponse> getGetActorMethod;
    if ((getGetActorMethod = ActorServiceGrpc.getGetActorMethod) == null) {
      synchronized (ActorServiceGrpc.class) {
        if ((getGetActorMethod = ActorServiceGrpc.getGetActorMethod) == null) {
          ActorServiceGrpc.getGetActorMethod = getGetActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.Actors.GetActorRequest, patches.v1.Actors.GetActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.GetActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.GetActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ActorServiceMethodDescriptorSupplier("GetActor"))
              .build();
        }
      }
    }
    return getGetActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Actors.GetActorByHandleRequest,
      patches.v1.Actors.GetActorByHandleResponse> getGetActorByHandleMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetActorByHandle",
      requestType = patches.v1.Actors.GetActorByHandleRequest.class,
      responseType = patches.v1.Actors.GetActorByHandleResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Actors.GetActorByHandleRequest,
      patches.v1.Actors.GetActorByHandleResponse> getGetActorByHandleMethod() {
    io.grpc.MethodDescriptor<patches.v1.Actors.GetActorByHandleRequest, patches.v1.Actors.GetActorByHandleResponse> getGetActorByHandleMethod;
    if ((getGetActorByHandleMethod = ActorServiceGrpc.getGetActorByHandleMethod) == null) {
      synchronized (ActorServiceGrpc.class) {
        if ((getGetActorByHandleMethod = ActorServiceGrpc.getGetActorByHandleMethod) == null) {
          ActorServiceGrpc.getGetActorByHandleMethod = getGetActorByHandleMethod =
              io.grpc.MethodDescriptor.<patches.v1.Actors.GetActorByHandleRequest, patches.v1.Actors.GetActorByHandleResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetActorByHandle"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.GetActorByHandleRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.GetActorByHandleResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ActorServiceMethodDescriptorSupplier("GetActorByHandle"))
              .build();
        }
      }
    }
    return getGetActorByHandleMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Actors.UpdateProfileRequest,
      patches.v1.Actors.UpdateProfileResponse> getUpdateProfileMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateProfile",
      requestType = patches.v1.Actors.UpdateProfileRequest.class,
      responseType = patches.v1.Actors.UpdateProfileResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Actors.UpdateProfileRequest,
      patches.v1.Actors.UpdateProfileResponse> getUpdateProfileMethod() {
    io.grpc.MethodDescriptor<patches.v1.Actors.UpdateProfileRequest, patches.v1.Actors.UpdateProfileResponse> getUpdateProfileMethod;
    if ((getUpdateProfileMethod = ActorServiceGrpc.getUpdateProfileMethod) == null) {
      synchronized (ActorServiceGrpc.class) {
        if ((getUpdateProfileMethod = ActorServiceGrpc.getUpdateProfileMethod) == null) {
          ActorServiceGrpc.getUpdateProfileMethod = getUpdateProfileMethod =
              io.grpc.MethodDescriptor.<patches.v1.Actors.UpdateProfileRequest, patches.v1.Actors.UpdateProfileResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateProfile"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.UpdateProfileRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.UpdateProfileResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ActorServiceMethodDescriptorSupplier("UpdateProfile"))
              .build();
        }
      }
    }
    return getUpdateProfileMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Actors.SearchActorsRequest,
      patches.v1.Actors.SearchActorsResponse> getSearchActorsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SearchActors",
      requestType = patches.v1.Actors.SearchActorsRequest.class,
      responseType = patches.v1.Actors.SearchActorsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Actors.SearchActorsRequest,
      patches.v1.Actors.SearchActorsResponse> getSearchActorsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Actors.SearchActorsRequest, patches.v1.Actors.SearchActorsResponse> getSearchActorsMethod;
    if ((getSearchActorsMethod = ActorServiceGrpc.getSearchActorsMethod) == null) {
      synchronized (ActorServiceGrpc.class) {
        if ((getSearchActorsMethod = ActorServiceGrpc.getSearchActorsMethod) == null) {
          ActorServiceGrpc.getSearchActorsMethod = getSearchActorsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Actors.SearchActorsRequest, patches.v1.Actors.SearchActorsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SearchActors"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.SearchActorsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.SearchActorsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ActorServiceMethodDescriptorSupplier("SearchActors"))
              .build();
        }
      }
    }
    return getSearchActorsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Actors.ListFollowersRequest,
      patches.v1.Actors.ListFollowersResponse> getListFollowersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListFollowers",
      requestType = patches.v1.Actors.ListFollowersRequest.class,
      responseType = patches.v1.Actors.ListFollowersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Actors.ListFollowersRequest,
      patches.v1.Actors.ListFollowersResponse> getListFollowersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Actors.ListFollowersRequest, patches.v1.Actors.ListFollowersResponse> getListFollowersMethod;
    if ((getListFollowersMethod = ActorServiceGrpc.getListFollowersMethod) == null) {
      synchronized (ActorServiceGrpc.class) {
        if ((getListFollowersMethod = ActorServiceGrpc.getListFollowersMethod) == null) {
          ActorServiceGrpc.getListFollowersMethod = getListFollowersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Actors.ListFollowersRequest, patches.v1.Actors.ListFollowersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListFollowers"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.ListFollowersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.ListFollowersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ActorServiceMethodDescriptorSupplier("ListFollowers"))
              .build();
        }
      }
    }
    return getListFollowersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Actors.ListFollowingRequest,
      patches.v1.Actors.ListFollowingResponse> getListFollowingMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListFollowing",
      requestType = patches.v1.Actors.ListFollowingRequest.class,
      responseType = patches.v1.Actors.ListFollowingResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Actors.ListFollowingRequest,
      patches.v1.Actors.ListFollowingResponse> getListFollowingMethod() {
    io.grpc.MethodDescriptor<patches.v1.Actors.ListFollowingRequest, patches.v1.Actors.ListFollowingResponse> getListFollowingMethod;
    if ((getListFollowingMethod = ActorServiceGrpc.getListFollowingMethod) == null) {
      synchronized (ActorServiceGrpc.class) {
        if ((getListFollowingMethod = ActorServiceGrpc.getListFollowingMethod) == null) {
          ActorServiceGrpc.getListFollowingMethod = getListFollowingMethod =
              io.grpc.MethodDescriptor.<patches.v1.Actors.ListFollowingRequest, patches.v1.Actors.ListFollowingResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListFollowing"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.ListFollowingRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.ListFollowingResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ActorServiceMethodDescriptorSupplier("ListFollowing"))
              .build();
        }
      }
    }
    return getListFollowingMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Actors.ResolveActorRequest,
      patches.v1.Actors.ResolveActorResponse> getResolveActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ResolveActor",
      requestType = patches.v1.Actors.ResolveActorRequest.class,
      responseType = patches.v1.Actors.ResolveActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Actors.ResolveActorRequest,
      patches.v1.Actors.ResolveActorResponse> getResolveActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.Actors.ResolveActorRequest, patches.v1.Actors.ResolveActorResponse> getResolveActorMethod;
    if ((getResolveActorMethod = ActorServiceGrpc.getResolveActorMethod) == null) {
      synchronized (ActorServiceGrpc.class) {
        if ((getResolveActorMethod = ActorServiceGrpc.getResolveActorMethod) == null) {
          ActorServiceGrpc.getResolveActorMethod = getResolveActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.Actors.ResolveActorRequest, patches.v1.Actors.ResolveActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ResolveActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.ResolveActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Actors.ResolveActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ActorServiceMethodDescriptorSupplier("ResolveActor"))
              .build();
        }
      }
    }
    return getResolveActorMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static ActorServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ActorServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ActorServiceStub>() {
        @java.lang.Override
        public ActorServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ActorServiceStub(channel, callOptions);
        }
      };
    return ActorServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static ActorServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ActorServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ActorServiceBlockingV2Stub>() {
        @java.lang.Override
        public ActorServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ActorServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return ActorServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static ActorServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ActorServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ActorServiceBlockingStub>() {
        @java.lang.Override
        public ActorServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ActorServiceBlockingStub(channel, callOptions);
        }
      };
    return ActorServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static ActorServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ActorServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ActorServiceFutureStub>() {
        @java.lang.Override
        public ActorServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ActorServiceFutureStub(channel, callOptions);
        }
      };
    return ActorServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Social identities: local accounts today, remote (federated) actors later (spec §19, §21,
   * §49). `ActorService` never exposes credentials — that is `AuthService`'s job (spec §165).
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Fetch by internal id.
     * </pre>
     */
    default void getActor(patches.v1.Actors.GetActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.GetActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetActorMethod(), responseObserver);
    }

    /**
     * <pre>
     * Fetch by handle (case-insensitive; matched against the normalized handle). Handles are
     * unique per node, not globally (spec §163) — this never crosses node boundaries.
     * </pre>
     */
    default void getActorByHandle(patches.v1.Actors.GetActorByHandleRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.GetActorByHandleResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetActorByHandleMethod(), responseObserver);
    }

    /**
     * <pre>
     * Partial update of the caller's own profile, driven by `update_mask` (see the message
     * comment below). Requires an authenticated session; the target actor is the caller's.
     * </pre>
     */
    default void updateProfile(patches.v1.Actors.UpdateProfileRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.UpdateProfileResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateProfileMethod(), responseObserver);
    }

    /**
     * <pre>
     * Handle-prefix + display-name search (spec §112). Elasticsearch is explicitly out of
     * scope for v0 — this is backed by Postgres trigram/full-text search server-side.
     * </pre>
     */
    default void searchActors(patches.v1.Actors.SearchActorsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.SearchActorsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSearchActorsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors following `actor_id`.
     * </pre>
     */
    default void listFollowers(patches.v1.Actors.ListFollowersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.ListFollowersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListFollowersMethod(), responseObserver);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors `actor_id` follows.
     * </pre>
     */
    default void listFollowing(patches.v1.Actors.ListFollowingRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.ListFollowingResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListFollowingMethod(), responseObserver);
    }

    /**
     * <pre>
     * B-028: discovers a remote actor by `acct:user&#64;domain` via WebFinger and returns it (as a
     * remote `Actor`, `is_local = false`) so the caller can `SocialGraphService.FollowActor` it —
     * the "add a friend on another node" entry point for the two-node federation lab. `NOT_
     * IMPLEMENTED` when this node has `FEDERATION_ENABLED=false` (spec §176's honest-UNIMPLEMENTED
     * rule): there is nothing to resolve against with no federation HTTP surface running.
     * </pre>
     */
    default void resolveActor(patches.v1.Actors.ResolveActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.ResolveActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getResolveActorMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service ActorService.
   * <pre>
   * Social identities: local accounts today, remote (federated) actors later (spec §19, §21,
   * §49). `ActorService` never exposes credentials — that is `AuthService`'s job (spec §165).
   * </pre>
   */
  public static abstract class ActorServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return ActorServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service ActorService.
   * <pre>
   * Social identities: local accounts today, remote (federated) actors later (spec §19, §21,
   * §49). `ActorService` never exposes credentials — that is `AuthService`'s job (spec §165).
   * </pre>
   */
  public static final class ActorServiceStub
      extends io.grpc.stub.AbstractAsyncStub<ActorServiceStub> {
    private ActorServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ActorServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ActorServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Fetch by internal id.
     * </pre>
     */
    public void getActor(patches.v1.Actors.GetActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.GetActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Fetch by handle (case-insensitive; matched against the normalized handle). Handles are
     * unique per node, not globally (spec §163) — this never crosses node boundaries.
     * </pre>
     */
    public void getActorByHandle(patches.v1.Actors.GetActorByHandleRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.GetActorByHandleResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetActorByHandleMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Partial update of the caller's own profile, driven by `update_mask` (see the message
     * comment below). Requires an authenticated session; the target actor is the caller's.
     * </pre>
     */
    public void updateProfile(patches.v1.Actors.UpdateProfileRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.UpdateProfileResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateProfileMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Handle-prefix + display-name search (spec §112). Elasticsearch is explicitly out of
     * scope for v0 — this is backed by Postgres trigram/full-text search server-side.
     * </pre>
     */
    public void searchActors(patches.v1.Actors.SearchActorsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.SearchActorsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSearchActorsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors following `actor_id`.
     * </pre>
     */
    public void listFollowers(patches.v1.Actors.ListFollowersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.ListFollowersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListFollowersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors `actor_id` follows.
     * </pre>
     */
    public void listFollowing(patches.v1.Actors.ListFollowingRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.ListFollowingResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListFollowingMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * B-028: discovers a remote actor by `acct:user&#64;domain` via WebFinger and returns it (as a
     * remote `Actor`, `is_local = false`) so the caller can `SocialGraphService.FollowActor` it —
     * the "add a friend on another node" entry point for the two-node federation lab. `NOT_
     * IMPLEMENTED` when this node has `FEDERATION_ENABLED=false` (spec §176's honest-UNIMPLEMENTED
     * rule): there is nothing to resolve against with no federation HTTP surface running.
     * </pre>
     */
    public void resolveActor(patches.v1.Actors.ResolveActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Actors.ResolveActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getResolveActorMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service ActorService.
   * <pre>
   * Social identities: local accounts today, remote (federated) actors later (spec §19, §21,
   * §49). `ActorService` never exposes credentials — that is `AuthService`'s job (spec §165).
   * </pre>
   */
  public static final class ActorServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<ActorServiceBlockingV2Stub> {
    private ActorServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ActorServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ActorServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Fetch by internal id.
     * </pre>
     */
    public patches.v1.Actors.GetActorResponse getActor(patches.v1.Actors.GetActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Fetch by handle (case-insensitive; matched against the normalized handle). Handles are
     * unique per node, not globally (spec §163) — this never crosses node boundaries.
     * </pre>
     */
    public patches.v1.Actors.GetActorByHandleResponse getActorByHandle(patches.v1.Actors.GetActorByHandleRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetActorByHandleMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Partial update of the caller's own profile, driven by `update_mask` (see the message
     * comment below). Requires an authenticated session; the target actor is the caller's.
     * </pre>
     */
    public patches.v1.Actors.UpdateProfileResponse updateProfile(patches.v1.Actors.UpdateProfileRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateProfileMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Handle-prefix + display-name search (spec §112). Elasticsearch is explicitly out of
     * scope for v0 — this is backed by Postgres trigram/full-text search server-side.
     * </pre>
     */
    public patches.v1.Actors.SearchActorsResponse searchActors(patches.v1.Actors.SearchActorsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSearchActorsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors following `actor_id`.
     * </pre>
     */
    public patches.v1.Actors.ListFollowersResponse listFollowers(patches.v1.Actors.ListFollowersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFollowersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors `actor_id` follows.
     * </pre>
     */
    public patches.v1.Actors.ListFollowingResponse listFollowing(patches.v1.Actors.ListFollowingRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFollowingMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * B-028: discovers a remote actor by `acct:user&#64;domain` via WebFinger and returns it (as a
     * remote `Actor`, `is_local = false`) so the caller can `SocialGraphService.FollowActor` it —
     * the "add a friend on another node" entry point for the two-node federation lab. `NOT_
     * IMPLEMENTED` when this node has `FEDERATION_ENABLED=false` (spec §176's honest-UNIMPLEMENTED
     * rule): there is nothing to resolve against with no federation HTTP surface running.
     * </pre>
     */
    public patches.v1.Actors.ResolveActorResponse resolveActor(patches.v1.Actors.ResolveActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getResolveActorMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service ActorService.
   * <pre>
   * Social identities: local accounts today, remote (federated) actors later (spec §19, §21,
   * §49). `ActorService` never exposes credentials — that is `AuthService`'s job (spec §165).
   * </pre>
   */
  public static final class ActorServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<ActorServiceBlockingStub> {
    private ActorServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ActorServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ActorServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Fetch by internal id.
     * </pre>
     */
    public patches.v1.Actors.GetActorResponse getActor(patches.v1.Actors.GetActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Fetch by handle (case-insensitive; matched against the normalized handle). Handles are
     * unique per node, not globally (spec §163) — this never crosses node boundaries.
     * </pre>
     */
    public patches.v1.Actors.GetActorByHandleResponse getActorByHandle(patches.v1.Actors.GetActorByHandleRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetActorByHandleMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Partial update of the caller's own profile, driven by `update_mask` (see the message
     * comment below). Requires an authenticated session; the target actor is the caller's.
     * </pre>
     */
    public patches.v1.Actors.UpdateProfileResponse updateProfile(patches.v1.Actors.UpdateProfileRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateProfileMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Handle-prefix + display-name search (spec §112). Elasticsearch is explicitly out of
     * scope for v0 — this is backed by Postgres trigram/full-text search server-side.
     * </pre>
     */
    public patches.v1.Actors.SearchActorsResponse searchActors(patches.v1.Actors.SearchActorsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSearchActorsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors following `actor_id`.
     * </pre>
     */
    public patches.v1.Actors.ListFollowersResponse listFollowers(patches.v1.Actors.ListFollowersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFollowersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors `actor_id` follows.
     * </pre>
     */
    public patches.v1.Actors.ListFollowingResponse listFollowing(patches.v1.Actors.ListFollowingRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFollowingMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * B-028: discovers a remote actor by `acct:user&#64;domain` via WebFinger and returns it (as a
     * remote `Actor`, `is_local = false`) so the caller can `SocialGraphService.FollowActor` it —
     * the "add a friend on another node" entry point for the two-node federation lab. `NOT_
     * IMPLEMENTED` when this node has `FEDERATION_ENABLED=false` (spec §176's honest-UNIMPLEMENTED
     * rule): there is nothing to resolve against with no federation HTTP surface running.
     * </pre>
     */
    public patches.v1.Actors.ResolveActorResponse resolveActor(patches.v1.Actors.ResolveActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getResolveActorMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service ActorService.
   * <pre>
   * Social identities: local accounts today, remote (federated) actors later (spec §19, §21,
   * §49). `ActorService` never exposes credentials — that is `AuthService`'s job (spec §165).
   * </pre>
   */
  public static final class ActorServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<ActorServiceFutureStub> {
    private ActorServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ActorServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ActorServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Fetch by internal id.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Actors.GetActorResponse> getActor(
        patches.v1.Actors.GetActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetActorMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Fetch by handle (case-insensitive; matched against the normalized handle). Handles are
     * unique per node, not globally (spec §163) — this never crosses node boundaries.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Actors.GetActorByHandleResponse> getActorByHandle(
        patches.v1.Actors.GetActorByHandleRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetActorByHandleMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Partial update of the caller's own profile, driven by `update_mask` (see the message
     * comment below). Requires an authenticated session; the target actor is the caller's.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Actors.UpdateProfileResponse> updateProfile(
        patches.v1.Actors.UpdateProfileRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateProfileMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Handle-prefix + display-name search (spec §112). Elasticsearch is explicitly out of
     * scope for v0 — this is backed by Postgres trigram/full-text search server-side.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Actors.SearchActorsResponse> searchActors(
        patches.v1.Actors.SearchActorsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSearchActorsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors following `actor_id`.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Actors.ListFollowersResponse> listFollowers(
        patches.v1.Actors.ListFollowersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListFollowersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Cursor-paginated list of actors `actor_id` follows.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Actors.ListFollowingResponse> listFollowing(
        patches.v1.Actors.ListFollowingRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListFollowingMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * B-028: discovers a remote actor by `acct:user&#64;domain` via WebFinger and returns it (as a
     * remote `Actor`, `is_local = false`) so the caller can `SocialGraphService.FollowActor` it —
     * the "add a friend on another node" entry point for the two-node federation lab. `NOT_
     * IMPLEMENTED` when this node has `FEDERATION_ENABLED=false` (spec §176's honest-UNIMPLEMENTED
     * rule): there is nothing to resolve against with no federation HTTP surface running.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Actors.ResolveActorResponse> resolveActor(
        patches.v1.Actors.ResolveActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getResolveActorMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_GET_ACTOR = 0;
  private static final int METHODID_GET_ACTOR_BY_HANDLE = 1;
  private static final int METHODID_UPDATE_PROFILE = 2;
  private static final int METHODID_SEARCH_ACTORS = 3;
  private static final int METHODID_LIST_FOLLOWERS = 4;
  private static final int METHODID_LIST_FOLLOWING = 5;
  private static final int METHODID_RESOLVE_ACTOR = 6;

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
        case METHODID_GET_ACTOR:
          serviceImpl.getActor((patches.v1.Actors.GetActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Actors.GetActorResponse>) responseObserver);
          break;
        case METHODID_GET_ACTOR_BY_HANDLE:
          serviceImpl.getActorByHandle((patches.v1.Actors.GetActorByHandleRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Actors.GetActorByHandleResponse>) responseObserver);
          break;
        case METHODID_UPDATE_PROFILE:
          serviceImpl.updateProfile((patches.v1.Actors.UpdateProfileRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Actors.UpdateProfileResponse>) responseObserver);
          break;
        case METHODID_SEARCH_ACTORS:
          serviceImpl.searchActors((patches.v1.Actors.SearchActorsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Actors.SearchActorsResponse>) responseObserver);
          break;
        case METHODID_LIST_FOLLOWERS:
          serviceImpl.listFollowers((patches.v1.Actors.ListFollowersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Actors.ListFollowersResponse>) responseObserver);
          break;
        case METHODID_LIST_FOLLOWING:
          serviceImpl.listFollowing((patches.v1.Actors.ListFollowingRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Actors.ListFollowingResponse>) responseObserver);
          break;
        case METHODID_RESOLVE_ACTOR:
          serviceImpl.resolveActor((patches.v1.Actors.ResolveActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Actors.ResolveActorResponse>) responseObserver);
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
          getGetActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Actors.GetActorRequest,
              patches.v1.Actors.GetActorResponse>(
                service, METHODID_GET_ACTOR)))
        .addMethod(
          getGetActorByHandleMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Actors.GetActorByHandleRequest,
              patches.v1.Actors.GetActorByHandleResponse>(
                service, METHODID_GET_ACTOR_BY_HANDLE)))
        .addMethod(
          getUpdateProfileMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Actors.UpdateProfileRequest,
              patches.v1.Actors.UpdateProfileResponse>(
                service, METHODID_UPDATE_PROFILE)))
        .addMethod(
          getSearchActorsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Actors.SearchActorsRequest,
              patches.v1.Actors.SearchActorsResponse>(
                service, METHODID_SEARCH_ACTORS)))
        .addMethod(
          getListFollowersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Actors.ListFollowersRequest,
              patches.v1.Actors.ListFollowersResponse>(
                service, METHODID_LIST_FOLLOWERS)))
        .addMethod(
          getListFollowingMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Actors.ListFollowingRequest,
              patches.v1.Actors.ListFollowingResponse>(
                service, METHODID_LIST_FOLLOWING)))
        .addMethod(
          getResolveActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Actors.ResolveActorRequest,
              patches.v1.Actors.ResolveActorResponse>(
                service, METHODID_RESOLVE_ACTOR)))
        .build();
  }

  private static abstract class ActorServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    ActorServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Actors.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("ActorService");
    }
  }

  private static final class ActorServiceFileDescriptorSupplier
      extends ActorServiceBaseDescriptorSupplier {
    ActorServiceFileDescriptorSupplier() {}
  }

  private static final class ActorServiceMethodDescriptorSupplier
      extends ActorServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    ActorServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (ActorServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new ActorServiceFileDescriptorSupplier())
              .addMethod(getGetActorMethod())
              .addMethod(getGetActorByHandleMethod())
              .addMethod(getUpdateProfileMethod())
              .addMethod(getSearchActorsMethod())
              .addMethod(getListFollowersMethod())
              .addMethod(getListFollowingMethod())
              .addMethod(getResolveActorMethod())
              .build();
        }
      }
    }
    return result;
  }
}
