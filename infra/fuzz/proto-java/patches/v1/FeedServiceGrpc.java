package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Chronological, fan-out-on-read feeds (spec §52, §59). Never `GetRecommendedFeed`/
 * `GetForYouFeed` — there is no engagement-ranked feed in this product (spec §153).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/feeds.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class FeedServiceGrpc {

  private FeedServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.FeedService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Feeds.ListHomeFeedRequest,
      patches.v1.Feeds.ListHomeFeedResponse> getListHomeFeedMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListHomeFeed",
      requestType = patches.v1.Feeds.ListHomeFeedRequest.class,
      responseType = patches.v1.Feeds.ListHomeFeedResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Feeds.ListHomeFeedRequest,
      patches.v1.Feeds.ListHomeFeedResponse> getListHomeFeedMethod() {
    io.grpc.MethodDescriptor<patches.v1.Feeds.ListHomeFeedRequest, patches.v1.Feeds.ListHomeFeedResponse> getListHomeFeedMethod;
    if ((getListHomeFeedMethod = FeedServiceGrpc.getListHomeFeedMethod) == null) {
      synchronized (FeedServiceGrpc.class) {
        if ((getListHomeFeedMethod = FeedServiceGrpc.getListHomeFeedMethod) == null) {
          FeedServiceGrpc.getListHomeFeedMethod = getListHomeFeedMethod =
              io.grpc.MethodDescriptor.<patches.v1.Feeds.ListHomeFeedRequest, patches.v1.Feeds.ListHomeFeedResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListHomeFeed"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListHomeFeedRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListHomeFeedResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FeedServiceMethodDescriptorSupplier("ListHomeFeed"))
              .build();
        }
      }
    }
    return getListHomeFeedMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Feeds.ListLocalFeedRequest,
      patches.v1.Feeds.ListLocalFeedResponse> getListLocalFeedMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListLocalFeed",
      requestType = patches.v1.Feeds.ListLocalFeedRequest.class,
      responseType = patches.v1.Feeds.ListLocalFeedResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Feeds.ListLocalFeedRequest,
      patches.v1.Feeds.ListLocalFeedResponse> getListLocalFeedMethod() {
    io.grpc.MethodDescriptor<patches.v1.Feeds.ListLocalFeedRequest, patches.v1.Feeds.ListLocalFeedResponse> getListLocalFeedMethod;
    if ((getListLocalFeedMethod = FeedServiceGrpc.getListLocalFeedMethod) == null) {
      synchronized (FeedServiceGrpc.class) {
        if ((getListLocalFeedMethod = FeedServiceGrpc.getListLocalFeedMethod) == null) {
          FeedServiceGrpc.getListLocalFeedMethod = getListLocalFeedMethod =
              io.grpc.MethodDescriptor.<patches.v1.Feeds.ListLocalFeedRequest, patches.v1.Feeds.ListLocalFeedResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListLocalFeed"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListLocalFeedRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListLocalFeedResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FeedServiceMethodDescriptorSupplier("ListLocalFeed"))
              .build();
        }
      }
    }
    return getListLocalFeedMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Feeds.ListActorPostsRequest,
      patches.v1.Feeds.ListActorPostsResponse> getListActorPostsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListActorPosts",
      requestType = patches.v1.Feeds.ListActorPostsRequest.class,
      responseType = patches.v1.Feeds.ListActorPostsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Feeds.ListActorPostsRequest,
      patches.v1.Feeds.ListActorPostsResponse> getListActorPostsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Feeds.ListActorPostsRequest, patches.v1.Feeds.ListActorPostsResponse> getListActorPostsMethod;
    if ((getListActorPostsMethod = FeedServiceGrpc.getListActorPostsMethod) == null) {
      synchronized (FeedServiceGrpc.class) {
        if ((getListActorPostsMethod = FeedServiceGrpc.getListActorPostsMethod) == null) {
          FeedServiceGrpc.getListActorPostsMethod = getListActorPostsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Feeds.ListActorPostsRequest, patches.v1.Feeds.ListActorPostsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListActorPosts"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListActorPostsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListActorPostsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FeedServiceMethodDescriptorSupplier("ListActorPosts"))
              .build();
        }
      }
    }
    return getListActorPostsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Feeds.ListTagFeedRequest,
      patches.v1.Feeds.ListTagFeedResponse> getListTagFeedMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListTagFeed",
      requestType = patches.v1.Feeds.ListTagFeedRequest.class,
      responseType = patches.v1.Feeds.ListTagFeedResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Feeds.ListTagFeedRequest,
      patches.v1.Feeds.ListTagFeedResponse> getListTagFeedMethod() {
    io.grpc.MethodDescriptor<patches.v1.Feeds.ListTagFeedRequest, patches.v1.Feeds.ListTagFeedResponse> getListTagFeedMethod;
    if ((getListTagFeedMethod = FeedServiceGrpc.getListTagFeedMethod) == null) {
      synchronized (FeedServiceGrpc.class) {
        if ((getListTagFeedMethod = FeedServiceGrpc.getListTagFeedMethod) == null) {
          FeedServiceGrpc.getListTagFeedMethod = getListTagFeedMethod =
              io.grpc.MethodDescriptor.<patches.v1.Feeds.ListTagFeedRequest, patches.v1.Feeds.ListTagFeedResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListTagFeed"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListTagFeedRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListTagFeedResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FeedServiceMethodDescriptorSupplier("ListTagFeed"))
              .build();
        }
      }
    }
    return getListTagFeedMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Feeds.ListCommunityFeedRequest,
      patches.v1.Feeds.ListCommunityFeedResponse> getListCommunityFeedMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListCommunityFeed",
      requestType = patches.v1.Feeds.ListCommunityFeedRequest.class,
      responseType = patches.v1.Feeds.ListCommunityFeedResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Feeds.ListCommunityFeedRequest,
      patches.v1.Feeds.ListCommunityFeedResponse> getListCommunityFeedMethod() {
    io.grpc.MethodDescriptor<patches.v1.Feeds.ListCommunityFeedRequest, patches.v1.Feeds.ListCommunityFeedResponse> getListCommunityFeedMethod;
    if ((getListCommunityFeedMethod = FeedServiceGrpc.getListCommunityFeedMethod) == null) {
      synchronized (FeedServiceGrpc.class) {
        if ((getListCommunityFeedMethod = FeedServiceGrpc.getListCommunityFeedMethod) == null) {
          FeedServiceGrpc.getListCommunityFeedMethod = getListCommunityFeedMethod =
              io.grpc.MethodDescriptor.<patches.v1.Feeds.ListCommunityFeedRequest, patches.v1.Feeds.ListCommunityFeedResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListCommunityFeed"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListCommunityFeedRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Feeds.ListCommunityFeedResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FeedServiceMethodDescriptorSupplier("ListCommunityFeed"))
              .build();
        }
      }
    }
    return getListCommunityFeedMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static FeedServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FeedServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FeedServiceStub>() {
        @java.lang.Override
        public FeedServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FeedServiceStub(channel, callOptions);
        }
      };
    return FeedServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static FeedServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FeedServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FeedServiceBlockingV2Stub>() {
        @java.lang.Override
        public FeedServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FeedServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return FeedServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static FeedServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FeedServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FeedServiceBlockingStub>() {
        @java.lang.Override
        public FeedServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FeedServiceBlockingStub(channel, callOptions);
        }
      };
    return FeedServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static FeedServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FeedServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FeedServiceFutureStub>() {
        @java.lang.Override
        public FeedServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FeedServiceFutureStub(channel, callOptions);
        }
      };
    return FeedServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Chronological, fan-out-on-read feeds (spec §52, §59). Never `GetRecommendedFeed`/
   * `GetForYouFeed` — there is no engagement-ranked feed in this product (spec §153).
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * The caller's home timeline: local + followed actors, fan-out-on-read, chronological.
     * </pre>
     */
    default void listHomeFeed(patches.v1.Feeds.ListHomeFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListHomeFeedResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListHomeFeedMethod(), responseObserver);
    }

    /**
     * <pre>
     * All local public posts, chronological.
     * </pre>
     */
    default void listLocalFeed(patches.v1.Feeds.ListLocalFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListLocalFeedResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListLocalFeedMethod(), responseObserver);
    }

    /**
     * <pre>
     * A given actor's posts, chronological.
     * </pre>
     */
    default void listActorPosts(patches.v1.Feeds.ListActorPostsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListActorPostsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListActorPostsMethod(), responseObserver);
    }

    /**
     * <pre>
     * All public posts carrying a given tag, chronological. No ordering parameter — same
     * chronological-only rule as every other feed (spec §182.2).
     * </pre>
     */
    default void listTagFeed(patches.v1.Feeds.ListTagFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListTagFeedResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListTagFeedMethod(), responseObserver);
    }

    /**
     * <pre>
     * A community's posts, chronological. No ordering parameter (spec §182.2).
     * </pre>
     */
    default void listCommunityFeed(patches.v1.Feeds.ListCommunityFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListCommunityFeedResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListCommunityFeedMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service FeedService.
   * <pre>
   * Chronological, fan-out-on-read feeds (spec §52, §59). Never `GetRecommendedFeed`/
   * `GetForYouFeed` — there is no engagement-ranked feed in this product (spec §153).
   * </pre>
   */
  public static abstract class FeedServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return FeedServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service FeedService.
   * <pre>
   * Chronological, fan-out-on-read feeds (spec §52, §59). Never `GetRecommendedFeed`/
   * `GetForYouFeed` — there is no engagement-ranked feed in this product (spec §153).
   * </pre>
   */
  public static final class FeedServiceStub
      extends io.grpc.stub.AbstractAsyncStub<FeedServiceStub> {
    private FeedServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FeedServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FeedServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * The caller's home timeline: local + followed actors, fan-out-on-read, chronological.
     * </pre>
     */
    public void listHomeFeed(patches.v1.Feeds.ListHomeFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListHomeFeedResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListHomeFeedMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * All local public posts, chronological.
     * </pre>
     */
    public void listLocalFeed(patches.v1.Feeds.ListLocalFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListLocalFeedResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListLocalFeedMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * A given actor's posts, chronological.
     * </pre>
     */
    public void listActorPosts(patches.v1.Feeds.ListActorPostsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListActorPostsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListActorPostsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * All public posts carrying a given tag, chronological. No ordering parameter — same
     * chronological-only rule as every other feed (spec §182.2).
     * </pre>
     */
    public void listTagFeed(patches.v1.Feeds.ListTagFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListTagFeedResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListTagFeedMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * A community's posts, chronological. No ordering parameter (spec §182.2).
     * </pre>
     */
    public void listCommunityFeed(patches.v1.Feeds.ListCommunityFeedRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Feeds.ListCommunityFeedResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListCommunityFeedMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service FeedService.
   * <pre>
   * Chronological, fan-out-on-read feeds (spec §52, §59). Never `GetRecommendedFeed`/
   * `GetForYouFeed` — there is no engagement-ranked feed in this product (spec §153).
   * </pre>
   */
  public static final class FeedServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<FeedServiceBlockingV2Stub> {
    private FeedServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FeedServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FeedServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * The caller's home timeline: local + followed actors, fan-out-on-read, chronological.
     * </pre>
     */
    public patches.v1.Feeds.ListHomeFeedResponse listHomeFeed(patches.v1.Feeds.ListHomeFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListHomeFeedMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * All local public posts, chronological.
     * </pre>
     */
    public patches.v1.Feeds.ListLocalFeedResponse listLocalFeed(patches.v1.Feeds.ListLocalFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListLocalFeedMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A given actor's posts, chronological.
     * </pre>
     */
    public patches.v1.Feeds.ListActorPostsResponse listActorPosts(patches.v1.Feeds.ListActorPostsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListActorPostsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * All public posts carrying a given tag, chronological. No ordering parameter — same
     * chronological-only rule as every other feed (spec §182.2).
     * </pre>
     */
    public patches.v1.Feeds.ListTagFeedResponse listTagFeed(patches.v1.Feeds.ListTagFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListTagFeedMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A community's posts, chronological. No ordering parameter (spec §182.2).
     * </pre>
     */
    public patches.v1.Feeds.ListCommunityFeedResponse listCommunityFeed(patches.v1.Feeds.ListCommunityFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCommunityFeedMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service FeedService.
   * <pre>
   * Chronological, fan-out-on-read feeds (spec §52, §59). Never `GetRecommendedFeed`/
   * `GetForYouFeed` — there is no engagement-ranked feed in this product (spec §153).
   * </pre>
   */
  public static final class FeedServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<FeedServiceBlockingStub> {
    private FeedServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FeedServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FeedServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * The caller's home timeline: local + followed actors, fan-out-on-read, chronological.
     * </pre>
     */
    public patches.v1.Feeds.ListHomeFeedResponse listHomeFeed(patches.v1.Feeds.ListHomeFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListHomeFeedMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * All local public posts, chronological.
     * </pre>
     */
    public patches.v1.Feeds.ListLocalFeedResponse listLocalFeed(patches.v1.Feeds.ListLocalFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListLocalFeedMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A given actor's posts, chronological.
     * </pre>
     */
    public patches.v1.Feeds.ListActorPostsResponse listActorPosts(patches.v1.Feeds.ListActorPostsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListActorPostsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * All public posts carrying a given tag, chronological. No ordering parameter — same
     * chronological-only rule as every other feed (spec §182.2).
     * </pre>
     */
    public patches.v1.Feeds.ListTagFeedResponse listTagFeed(patches.v1.Feeds.ListTagFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListTagFeedMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A community's posts, chronological. No ordering parameter (spec §182.2).
     * </pre>
     */
    public patches.v1.Feeds.ListCommunityFeedResponse listCommunityFeed(patches.v1.Feeds.ListCommunityFeedRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCommunityFeedMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service FeedService.
   * <pre>
   * Chronological, fan-out-on-read feeds (spec §52, §59). Never `GetRecommendedFeed`/
   * `GetForYouFeed` — there is no engagement-ranked feed in this product (spec §153).
   * </pre>
   */
  public static final class FeedServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<FeedServiceFutureStub> {
    private FeedServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FeedServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FeedServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * The caller's home timeline: local + followed actors, fan-out-on-read, chronological.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Feeds.ListHomeFeedResponse> listHomeFeed(
        patches.v1.Feeds.ListHomeFeedRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListHomeFeedMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * All local public posts, chronological.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Feeds.ListLocalFeedResponse> listLocalFeed(
        patches.v1.Feeds.ListLocalFeedRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListLocalFeedMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * A given actor's posts, chronological.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Feeds.ListActorPostsResponse> listActorPosts(
        patches.v1.Feeds.ListActorPostsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListActorPostsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * All public posts carrying a given tag, chronological. No ordering parameter — same
     * chronological-only rule as every other feed (spec §182.2).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Feeds.ListTagFeedResponse> listTagFeed(
        patches.v1.Feeds.ListTagFeedRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListTagFeedMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * A community's posts, chronological. No ordering parameter (spec §182.2).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Feeds.ListCommunityFeedResponse> listCommunityFeed(
        patches.v1.Feeds.ListCommunityFeedRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListCommunityFeedMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_LIST_HOME_FEED = 0;
  private static final int METHODID_LIST_LOCAL_FEED = 1;
  private static final int METHODID_LIST_ACTOR_POSTS = 2;
  private static final int METHODID_LIST_TAG_FEED = 3;
  private static final int METHODID_LIST_COMMUNITY_FEED = 4;

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
        case METHODID_LIST_HOME_FEED:
          serviceImpl.listHomeFeed((patches.v1.Feeds.ListHomeFeedRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Feeds.ListHomeFeedResponse>) responseObserver);
          break;
        case METHODID_LIST_LOCAL_FEED:
          serviceImpl.listLocalFeed((patches.v1.Feeds.ListLocalFeedRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Feeds.ListLocalFeedResponse>) responseObserver);
          break;
        case METHODID_LIST_ACTOR_POSTS:
          serviceImpl.listActorPosts((patches.v1.Feeds.ListActorPostsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Feeds.ListActorPostsResponse>) responseObserver);
          break;
        case METHODID_LIST_TAG_FEED:
          serviceImpl.listTagFeed((patches.v1.Feeds.ListTagFeedRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Feeds.ListTagFeedResponse>) responseObserver);
          break;
        case METHODID_LIST_COMMUNITY_FEED:
          serviceImpl.listCommunityFeed((patches.v1.Feeds.ListCommunityFeedRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Feeds.ListCommunityFeedResponse>) responseObserver);
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
          getListHomeFeedMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Feeds.ListHomeFeedRequest,
              patches.v1.Feeds.ListHomeFeedResponse>(
                service, METHODID_LIST_HOME_FEED)))
        .addMethod(
          getListLocalFeedMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Feeds.ListLocalFeedRequest,
              patches.v1.Feeds.ListLocalFeedResponse>(
                service, METHODID_LIST_LOCAL_FEED)))
        .addMethod(
          getListActorPostsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Feeds.ListActorPostsRequest,
              patches.v1.Feeds.ListActorPostsResponse>(
                service, METHODID_LIST_ACTOR_POSTS)))
        .addMethod(
          getListTagFeedMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Feeds.ListTagFeedRequest,
              patches.v1.Feeds.ListTagFeedResponse>(
                service, METHODID_LIST_TAG_FEED)))
        .addMethod(
          getListCommunityFeedMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Feeds.ListCommunityFeedRequest,
              patches.v1.Feeds.ListCommunityFeedResponse>(
                service, METHODID_LIST_COMMUNITY_FEED)))
        .build();
  }

  private static abstract class FeedServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    FeedServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Feeds.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("FeedService");
    }
  }

  private static final class FeedServiceFileDescriptorSupplier
      extends FeedServiceBaseDescriptorSupplier {
    FeedServiceFileDescriptorSupplier() {}
  }

  private static final class FeedServiceMethodDescriptorSupplier
      extends FeedServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    FeedServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (FeedServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new FeedServiceFileDescriptorSupplier())
              .addMethod(getListHomeFeedMethod())
              .addMethod(getListLocalFeedMethod())
              .addMethod(getListActorPostsMethod())
              .addMethod(getListTagFeedMethod())
              .addMethod(getListCommunityFeedMethod())
              .build();
        }
      }
    }
    return result;
  }
}
