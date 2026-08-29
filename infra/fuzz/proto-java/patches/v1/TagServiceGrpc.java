package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Hashtag search and per-actor tag mutes (spec §189–190). Deliberately no post-count/
 * popularity surface anywhere in this service (spec §181, §58) — there is no engagement
 * ranking in this product and a tag's count is not published.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/tags.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class TagServiceGrpc {

  private TagServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.TagService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Tags.SearchTagsRequest,
      patches.v1.Tags.SearchTagsResponse> getSearchTagsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SearchTags",
      requestType = patches.v1.Tags.SearchTagsRequest.class,
      responseType = patches.v1.Tags.SearchTagsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Tags.SearchTagsRequest,
      patches.v1.Tags.SearchTagsResponse> getSearchTagsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Tags.SearchTagsRequest, patches.v1.Tags.SearchTagsResponse> getSearchTagsMethod;
    if ((getSearchTagsMethod = TagServiceGrpc.getSearchTagsMethod) == null) {
      synchronized (TagServiceGrpc.class) {
        if ((getSearchTagsMethod = TagServiceGrpc.getSearchTagsMethod) == null) {
          TagServiceGrpc.getSearchTagsMethod = getSearchTagsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Tags.SearchTagsRequest, patches.v1.Tags.SearchTagsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SearchTags"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.SearchTagsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.SearchTagsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TagServiceMethodDescriptorSupplier("SearchTags"))
              .build();
        }
      }
    }
    return getSearchTagsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Tags.MuteTagRequest,
      patches.v1.Tags.MuteTagResponse> getMuteTagMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "MuteTag",
      requestType = patches.v1.Tags.MuteTagRequest.class,
      responseType = patches.v1.Tags.MuteTagResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Tags.MuteTagRequest,
      patches.v1.Tags.MuteTagResponse> getMuteTagMethod() {
    io.grpc.MethodDescriptor<patches.v1.Tags.MuteTagRequest, patches.v1.Tags.MuteTagResponse> getMuteTagMethod;
    if ((getMuteTagMethod = TagServiceGrpc.getMuteTagMethod) == null) {
      synchronized (TagServiceGrpc.class) {
        if ((getMuteTagMethod = TagServiceGrpc.getMuteTagMethod) == null) {
          TagServiceGrpc.getMuteTagMethod = getMuteTagMethod =
              io.grpc.MethodDescriptor.<patches.v1.Tags.MuteTagRequest, patches.v1.Tags.MuteTagResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "MuteTag"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.MuteTagRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.MuteTagResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TagServiceMethodDescriptorSupplier("MuteTag"))
              .build();
        }
      }
    }
    return getMuteTagMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Tags.UnmuteTagRequest,
      patches.v1.Tags.UnmuteTagResponse> getUnmuteTagMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnmuteTag",
      requestType = patches.v1.Tags.UnmuteTagRequest.class,
      responseType = patches.v1.Tags.UnmuteTagResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Tags.UnmuteTagRequest,
      patches.v1.Tags.UnmuteTagResponse> getUnmuteTagMethod() {
    io.grpc.MethodDescriptor<patches.v1.Tags.UnmuteTagRequest, patches.v1.Tags.UnmuteTagResponse> getUnmuteTagMethod;
    if ((getUnmuteTagMethod = TagServiceGrpc.getUnmuteTagMethod) == null) {
      synchronized (TagServiceGrpc.class) {
        if ((getUnmuteTagMethod = TagServiceGrpc.getUnmuteTagMethod) == null) {
          TagServiceGrpc.getUnmuteTagMethod = getUnmuteTagMethod =
              io.grpc.MethodDescriptor.<patches.v1.Tags.UnmuteTagRequest, patches.v1.Tags.UnmuteTagResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnmuteTag"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.UnmuteTagRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.UnmuteTagResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TagServiceMethodDescriptorSupplier("UnmuteTag"))
              .build();
        }
      }
    }
    return getUnmuteTagMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Tags.ListMutedTagsRequest,
      patches.v1.Tags.ListMutedTagsResponse> getListMutedTagsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListMutedTags",
      requestType = patches.v1.Tags.ListMutedTagsRequest.class,
      responseType = patches.v1.Tags.ListMutedTagsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Tags.ListMutedTagsRequest,
      patches.v1.Tags.ListMutedTagsResponse> getListMutedTagsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Tags.ListMutedTagsRequest, patches.v1.Tags.ListMutedTagsResponse> getListMutedTagsMethod;
    if ((getListMutedTagsMethod = TagServiceGrpc.getListMutedTagsMethod) == null) {
      synchronized (TagServiceGrpc.class) {
        if ((getListMutedTagsMethod = TagServiceGrpc.getListMutedTagsMethod) == null) {
          TagServiceGrpc.getListMutedTagsMethod = getListMutedTagsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Tags.ListMutedTagsRequest, patches.v1.Tags.ListMutedTagsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListMutedTags"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.ListMutedTagsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Tags.ListMutedTagsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new TagServiceMethodDescriptorSupplier("ListMutedTags"))
              .build();
        }
      }
    }
    return getListMutedTagsMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static TagServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TagServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TagServiceStub>() {
        @java.lang.Override
        public TagServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TagServiceStub(channel, callOptions);
        }
      };
    return TagServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static TagServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TagServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TagServiceBlockingV2Stub>() {
        @java.lang.Override
        public TagServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TagServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return TagServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static TagServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TagServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TagServiceBlockingStub>() {
        @java.lang.Override
        public TagServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TagServiceBlockingStub(channel, callOptions);
        }
      };
    return TagServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static TagServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<TagServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<TagServiceFutureStub>() {
        @java.lang.Override
        public TagServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new TagServiceFutureStub(channel, callOptions);
        }
      };
    return TagServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Hashtag search and per-actor tag mutes (spec §189–190). Deliberately no post-count/
   * popularity surface anywhere in this service (spec §181, §58) — there is no engagement
   * ranking in this product and a tag's count is not published.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Handle-prefix-style search over tag names (spec §112's search pattern, applied to tags).
     * </pre>
     */
    default void searchTags(patches.v1.Tags.SearchTagsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.SearchTagsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSearchTagsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: muting an already-muted tag is not an error.
     * </pre>
     */
    default void muteTag(patches.v1.Tags.MuteTagRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.MuteTagResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getMuteTagMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unmuting a tag the caller hasn't muted is not an error.
     * </pre>
     */
    default void unmuteTag(patches.v1.Tags.UnmuteTagRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.UnmuteTagResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnmuteTagMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own muted tags, most-recent first.
     * </pre>
     */
    default void listMutedTags(patches.v1.Tags.ListMutedTagsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.ListMutedTagsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListMutedTagsMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service TagService.
   * <pre>
   * Hashtag search and per-actor tag mutes (spec §189–190). Deliberately no post-count/
   * popularity surface anywhere in this service (spec §181, §58) — there is no engagement
   * ranking in this product and a tag's count is not published.
   * </pre>
   */
  public static abstract class TagServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return TagServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service TagService.
   * <pre>
   * Hashtag search and per-actor tag mutes (spec §189–190). Deliberately no post-count/
   * popularity surface anywhere in this service (spec §181, §58) — there is no engagement
   * ranking in this product and a tag's count is not published.
   * </pre>
   */
  public static final class TagServiceStub
      extends io.grpc.stub.AbstractAsyncStub<TagServiceStub> {
    private TagServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TagServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TagServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Handle-prefix-style search over tag names (spec §112's search pattern, applied to tags).
     * </pre>
     */
    public void searchTags(patches.v1.Tags.SearchTagsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.SearchTagsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSearchTagsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: muting an already-muted tag is not an error.
     * </pre>
     */
    public void muteTag(patches.v1.Tags.MuteTagRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.MuteTagResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getMuteTagMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unmuting a tag the caller hasn't muted is not an error.
     * </pre>
     */
    public void unmuteTag(patches.v1.Tags.UnmuteTagRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.UnmuteTagResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnmuteTagMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own muted tags, most-recent first.
     * </pre>
     */
    public void listMutedTags(patches.v1.Tags.ListMutedTagsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Tags.ListMutedTagsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListMutedTagsMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service TagService.
   * <pre>
   * Hashtag search and per-actor tag mutes (spec §189–190). Deliberately no post-count/
   * popularity surface anywhere in this service (spec §181, §58) — there is no engagement
   * ranking in this product and a tag's count is not published.
   * </pre>
   */
  public static final class TagServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<TagServiceBlockingV2Stub> {
    private TagServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TagServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TagServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Handle-prefix-style search over tag names (spec §112's search pattern, applied to tags).
     * </pre>
     */
    public patches.v1.Tags.SearchTagsResponse searchTags(patches.v1.Tags.SearchTagsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSearchTagsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: muting an already-muted tag is not an error.
     * </pre>
     */
    public patches.v1.Tags.MuteTagResponse muteTag(patches.v1.Tags.MuteTagRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMuteTagMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unmuting a tag the caller hasn't muted is not an error.
     * </pre>
     */
    public patches.v1.Tags.UnmuteTagResponse unmuteTag(patches.v1.Tags.UnmuteTagRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnmuteTagMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own muted tags, most-recent first.
     * </pre>
     */
    public patches.v1.Tags.ListMutedTagsResponse listMutedTags(patches.v1.Tags.ListMutedTagsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMutedTagsMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service TagService.
   * <pre>
   * Hashtag search and per-actor tag mutes (spec §189–190). Deliberately no post-count/
   * popularity surface anywhere in this service (spec §181, §58) — there is no engagement
   * ranking in this product and a tag's count is not published.
   * </pre>
   */
  public static final class TagServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<TagServiceBlockingStub> {
    private TagServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TagServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TagServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Handle-prefix-style search over tag names (spec §112's search pattern, applied to tags).
     * </pre>
     */
    public patches.v1.Tags.SearchTagsResponse searchTags(patches.v1.Tags.SearchTagsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSearchTagsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: muting an already-muted tag is not an error.
     * </pre>
     */
    public patches.v1.Tags.MuteTagResponse muteTag(patches.v1.Tags.MuteTagRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMuteTagMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unmuting a tag the caller hasn't muted is not an error.
     * </pre>
     */
    public patches.v1.Tags.UnmuteTagResponse unmuteTag(patches.v1.Tags.UnmuteTagRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnmuteTagMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own muted tags, most-recent first.
     * </pre>
     */
    public patches.v1.Tags.ListMutedTagsResponse listMutedTags(patches.v1.Tags.ListMutedTagsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMutedTagsMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service TagService.
   * <pre>
   * Hashtag search and per-actor tag mutes (spec §189–190). Deliberately no post-count/
   * popularity surface anywhere in this service (spec §181, §58) — there is no engagement
   * ranking in this product and a tag's count is not published.
   * </pre>
   */
  public static final class TagServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<TagServiceFutureStub> {
    private TagServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected TagServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new TagServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Handle-prefix-style search over tag names (spec §112's search pattern, applied to tags).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Tags.SearchTagsResponse> searchTags(
        patches.v1.Tags.SearchTagsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSearchTagsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: muting an already-muted tag is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Tags.MuteTagResponse> muteTag(
        patches.v1.Tags.MuteTagRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getMuteTagMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unmuting a tag the caller hasn't muted is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Tags.UnmuteTagResponse> unmuteTag(
        patches.v1.Tags.UnmuteTagRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnmuteTagMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own muted tags, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Tags.ListMutedTagsResponse> listMutedTags(
        patches.v1.Tags.ListMutedTagsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListMutedTagsMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_SEARCH_TAGS = 0;
  private static final int METHODID_MUTE_TAG = 1;
  private static final int METHODID_UNMUTE_TAG = 2;
  private static final int METHODID_LIST_MUTED_TAGS = 3;

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
        case METHODID_SEARCH_TAGS:
          serviceImpl.searchTags((patches.v1.Tags.SearchTagsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Tags.SearchTagsResponse>) responseObserver);
          break;
        case METHODID_MUTE_TAG:
          serviceImpl.muteTag((patches.v1.Tags.MuteTagRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Tags.MuteTagResponse>) responseObserver);
          break;
        case METHODID_UNMUTE_TAG:
          serviceImpl.unmuteTag((patches.v1.Tags.UnmuteTagRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Tags.UnmuteTagResponse>) responseObserver);
          break;
        case METHODID_LIST_MUTED_TAGS:
          serviceImpl.listMutedTags((patches.v1.Tags.ListMutedTagsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Tags.ListMutedTagsResponse>) responseObserver);
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
          getSearchTagsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Tags.SearchTagsRequest,
              patches.v1.Tags.SearchTagsResponse>(
                service, METHODID_SEARCH_TAGS)))
        .addMethod(
          getMuteTagMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Tags.MuteTagRequest,
              patches.v1.Tags.MuteTagResponse>(
                service, METHODID_MUTE_TAG)))
        .addMethod(
          getUnmuteTagMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Tags.UnmuteTagRequest,
              patches.v1.Tags.UnmuteTagResponse>(
                service, METHODID_UNMUTE_TAG)))
        .addMethod(
          getListMutedTagsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Tags.ListMutedTagsRequest,
              patches.v1.Tags.ListMutedTagsResponse>(
                service, METHODID_LIST_MUTED_TAGS)))
        .build();
  }

  private static abstract class TagServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    TagServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Tags.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("TagService");
    }
  }

  private static final class TagServiceFileDescriptorSupplier
      extends TagServiceBaseDescriptorSupplier {
    TagServiceFileDescriptorSupplier() {}
  }

  private static final class TagServiceMethodDescriptorSupplier
      extends TagServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    TagServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (TagServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new TagServiceFileDescriptorSupplier())
              .addMethod(getSearchTagsMethod())
              .addMethod(getMuteTagMethod())
              .addMethod(getUnmuteTagMethod())
              .addMethod(getListMutedTagsMethod())
              .build();
        }
      }
    }
    return result;
  }
}
