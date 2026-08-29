package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Posts and replies — there is no separate comment entity (spec §23–26, §51).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/posts.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class PostServiceGrpc {

  private PostServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.PostService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.CreatePostRequest,
      patches.v1.Posts.CreatePostResponse> getCreatePostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreatePost",
      requestType = patches.v1.Posts.CreatePostRequest.class,
      responseType = patches.v1.Posts.CreatePostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.CreatePostRequest,
      patches.v1.Posts.CreatePostResponse> getCreatePostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.CreatePostRequest, patches.v1.Posts.CreatePostResponse> getCreatePostMethod;
    if ((getCreatePostMethod = PostServiceGrpc.getCreatePostMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getCreatePostMethod = PostServiceGrpc.getCreatePostMethod) == null) {
          PostServiceGrpc.getCreatePostMethod = getCreatePostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.CreatePostRequest, patches.v1.Posts.CreatePostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreatePost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.CreatePostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.CreatePostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("CreatePost"))
              .build();
        }
      }
    }
    return getCreatePostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.GetPostRequest,
      patches.v1.Posts.GetPostResponse> getGetPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetPost",
      requestType = patches.v1.Posts.GetPostRequest.class,
      responseType = patches.v1.Posts.GetPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.GetPostRequest,
      patches.v1.Posts.GetPostResponse> getGetPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.GetPostRequest, patches.v1.Posts.GetPostResponse> getGetPostMethod;
    if ((getGetPostMethod = PostServiceGrpc.getGetPostMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getGetPostMethod = PostServiceGrpc.getGetPostMethod) == null) {
          PostServiceGrpc.getGetPostMethod = getGetPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.GetPostRequest, patches.v1.Posts.GetPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.GetPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.GetPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("GetPost"))
              .build();
        }
      }
    }
    return getGetPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.DeletePostRequest,
      patches.v1.Posts.DeletePostResponse> getDeletePostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "DeletePost",
      requestType = patches.v1.Posts.DeletePostRequest.class,
      responseType = patches.v1.Posts.DeletePostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.DeletePostRequest,
      patches.v1.Posts.DeletePostResponse> getDeletePostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.DeletePostRequest, patches.v1.Posts.DeletePostResponse> getDeletePostMethod;
    if ((getDeletePostMethod = PostServiceGrpc.getDeletePostMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getDeletePostMethod = PostServiceGrpc.getDeletePostMethod) == null) {
          PostServiceGrpc.getDeletePostMethod = getDeletePostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.DeletePostRequest, patches.v1.Posts.DeletePostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "DeletePost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.DeletePostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.DeletePostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("DeletePost"))
              .build();
        }
      }
    }
    return getDeletePostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.ListRepliesRequest,
      patches.v1.Posts.ListRepliesResponse> getListRepliesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListReplies",
      requestType = patches.v1.Posts.ListRepliesRequest.class,
      responseType = patches.v1.Posts.ListRepliesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.ListRepliesRequest,
      patches.v1.Posts.ListRepliesResponse> getListRepliesMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.ListRepliesRequest, patches.v1.Posts.ListRepliesResponse> getListRepliesMethod;
    if ((getListRepliesMethod = PostServiceGrpc.getListRepliesMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getListRepliesMethod = PostServiceGrpc.getListRepliesMethod) == null) {
          PostServiceGrpc.getListRepliesMethod = getListRepliesMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.ListRepliesRequest, patches.v1.Posts.ListRepliesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListReplies"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.ListRepliesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.ListRepliesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("ListReplies"))
              .build();
        }
      }
    }
    return getListRepliesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.EditPostRequest,
      patches.v1.Posts.EditPostResponse> getEditPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "EditPost",
      requestType = patches.v1.Posts.EditPostRequest.class,
      responseType = patches.v1.Posts.EditPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.EditPostRequest,
      patches.v1.Posts.EditPostResponse> getEditPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.EditPostRequest, patches.v1.Posts.EditPostResponse> getEditPostMethod;
    if ((getEditPostMethod = PostServiceGrpc.getEditPostMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getEditPostMethod = PostServiceGrpc.getEditPostMethod) == null) {
          PostServiceGrpc.getEditPostMethod = getEditPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.EditPostRequest, patches.v1.Posts.EditPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "EditPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.EditPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.EditPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("EditPost"))
              .build();
        }
      }
    }
    return getEditPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.ListPostEditsRequest,
      patches.v1.Posts.ListPostEditsResponse> getListPostEditsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListPostEdits",
      requestType = patches.v1.Posts.ListPostEditsRequest.class,
      responseType = patches.v1.Posts.ListPostEditsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.ListPostEditsRequest,
      patches.v1.Posts.ListPostEditsResponse> getListPostEditsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.ListPostEditsRequest, patches.v1.Posts.ListPostEditsResponse> getListPostEditsMethod;
    if ((getListPostEditsMethod = PostServiceGrpc.getListPostEditsMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getListPostEditsMethod = PostServiceGrpc.getListPostEditsMethod) == null) {
          PostServiceGrpc.getListPostEditsMethod = getListPostEditsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.ListPostEditsRequest, patches.v1.Posts.ListPostEditsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListPostEdits"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.ListPostEditsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.ListPostEditsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("ListPostEdits"))
              .build();
        }
      }
    }
    return getListPostEditsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.PinPostRequest,
      patches.v1.Posts.PinPostResponse> getPinPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PinPost",
      requestType = patches.v1.Posts.PinPostRequest.class,
      responseType = patches.v1.Posts.PinPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.PinPostRequest,
      patches.v1.Posts.PinPostResponse> getPinPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.PinPostRequest, patches.v1.Posts.PinPostResponse> getPinPostMethod;
    if ((getPinPostMethod = PostServiceGrpc.getPinPostMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getPinPostMethod = PostServiceGrpc.getPinPostMethod) == null) {
          PostServiceGrpc.getPinPostMethod = getPinPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.PinPostRequest, patches.v1.Posts.PinPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PinPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.PinPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.PinPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("PinPost"))
              .build();
        }
      }
    }
    return getPinPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.UnpinPostRequest,
      patches.v1.Posts.UnpinPostResponse> getUnpinPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnpinPost",
      requestType = patches.v1.Posts.UnpinPostRequest.class,
      responseType = patches.v1.Posts.UnpinPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.UnpinPostRequest,
      patches.v1.Posts.UnpinPostResponse> getUnpinPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.UnpinPostRequest, patches.v1.Posts.UnpinPostResponse> getUnpinPostMethod;
    if ((getUnpinPostMethod = PostServiceGrpc.getUnpinPostMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getUnpinPostMethod = PostServiceGrpc.getUnpinPostMethod) == null) {
          PostServiceGrpc.getUnpinPostMethod = getUnpinPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.UnpinPostRequest, patches.v1.Posts.UnpinPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnpinPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.UnpinPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.UnpinPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("UnpinPost"))
              .build();
        }
      }
    }
    return getUnpinPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Posts.SearchPostsRequest,
      patches.v1.Posts.SearchPostsResponse> getSearchPostsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SearchPosts",
      requestType = patches.v1.Posts.SearchPostsRequest.class,
      responseType = patches.v1.Posts.SearchPostsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Posts.SearchPostsRequest,
      patches.v1.Posts.SearchPostsResponse> getSearchPostsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Posts.SearchPostsRequest, patches.v1.Posts.SearchPostsResponse> getSearchPostsMethod;
    if ((getSearchPostsMethod = PostServiceGrpc.getSearchPostsMethod) == null) {
      synchronized (PostServiceGrpc.class) {
        if ((getSearchPostsMethod = PostServiceGrpc.getSearchPostsMethod) == null) {
          PostServiceGrpc.getSearchPostsMethod = getSearchPostsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Posts.SearchPostsRequest, patches.v1.Posts.SearchPostsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SearchPosts"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.SearchPostsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Posts.SearchPostsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PostServiceMethodDescriptorSupplier("SearchPosts"))
              .build();
        }
      }
    }
    return getSearchPostsMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static PostServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PostServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PostServiceStub>() {
        @java.lang.Override
        public PostServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PostServiceStub(channel, callOptions);
        }
      };
    return PostServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static PostServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PostServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PostServiceBlockingV2Stub>() {
        @java.lang.Override
        public PostServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PostServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return PostServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static PostServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PostServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PostServiceBlockingStub>() {
        @java.lang.Override
        public PostServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PostServiceBlockingStub(channel, callOptions);
        }
      };
    return PostServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static PostServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PostServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PostServiceFutureStub>() {
        @java.lang.Override
        public PostServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PostServiceFutureStub(channel, callOptions);
        }
      };
    return PostServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Posts and replies — there is no separate comment entity (spec §23–26, §51).
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Requires `client_request_id` (spec §45); the backend enforces idempotency conceptually
     * on (author_actor_id, client_request_id) so a client-side retry cannot create a
     * duplicate post.
     * </pre>
     */
    default void createPost(patches.v1.Posts.CreatePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.CreatePostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreatePostMethod(), responseObserver);
    }

    /**
     */
    default void getPost(patches.v1.Posts.GetPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.GetPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Soft delete/tombstone (spec §25) — never a hard delete over this API.
     * </pre>
     */
    default void deletePost(patches.v1.Posts.DeletePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.DeletePostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getDeletePostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Cursor-paginated, depth-bounded thread read (spec §24). Never loads an arbitrarily large
     * thread in one call.
     * </pre>
     */
    default void listReplies(patches.v1.Posts.ListRepliesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.ListRepliesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListRepliesMethod(), responseObserver);
    }

    /**
     * <pre>
     * In-place body/content-warning/media edit (spec §189, §26 amended). Up to 20 edits per
     * post (spec §188); every edit is snapshotted to `post_edits` before it is applied, readable
     * via `ListPostEdits`.
     * </pre>
     */
    default void editPost(patches.v1.Posts.EditPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.EditPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getEditPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * The edit history of a post, most-recent first.
     * </pre>
     */
    default void listPostEdits(patches.v1.Posts.ListPostEditsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.ListPostEditsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListPostEditsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Pins one of the caller's own posts to their profile. Up to 3 pinned posts per actor
     * (spec §188); `position` (0-2) sets display order.
     * </pre>
     */
    default void pinPost(patches.v1.Posts.PinPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.PinPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPinPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unpinning a post that isn't pinned is not an error.
     * </pre>
     */
    default void unpinPost(patches.v1.Posts.UnpinPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.UnpinPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnpinPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Full-text search over local post bodies (Postgres `websearch_to_tsquery`). Results are
     * strictly newest-first, keyset-paged like every other list RPC — there is no relevance
     * score and never a `sort`/`order` parameter (spec §194).
     * </pre>
     */
    default void searchPosts(patches.v1.Posts.SearchPostsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.SearchPostsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSearchPostsMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service PostService.
   * <pre>
   * Posts and replies — there is no separate comment entity (spec §23–26, §51).
   * </pre>
   */
  public static abstract class PostServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return PostServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service PostService.
   * <pre>
   * Posts and replies — there is no separate comment entity (spec §23–26, §51).
   * </pre>
   */
  public static final class PostServiceStub
      extends io.grpc.stub.AbstractAsyncStub<PostServiceStub> {
    private PostServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PostServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PostServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Requires `client_request_id` (spec §45); the backend enforces idempotency conceptually
     * on (author_actor_id, client_request_id) so a client-side retry cannot create a
     * duplicate post.
     * </pre>
     */
    public void createPost(patches.v1.Posts.CreatePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.CreatePostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreatePostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getPost(patches.v1.Posts.GetPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.GetPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Soft delete/tombstone (spec §25) — never a hard delete over this API.
     * </pre>
     */
    public void deletePost(patches.v1.Posts.DeletePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.DeletePostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getDeletePostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Cursor-paginated, depth-bounded thread read (spec §24). Never loads an arbitrarily large
     * thread in one call.
     * </pre>
     */
    public void listReplies(patches.v1.Posts.ListRepliesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.ListRepliesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListRepliesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * In-place body/content-warning/media edit (spec §189, §26 amended). Up to 20 edits per
     * post (spec §188); every edit is snapshotted to `post_edits` before it is applied, readable
     * via `ListPostEdits`.
     * </pre>
     */
    public void editPost(patches.v1.Posts.EditPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.EditPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getEditPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The edit history of a post, most-recent first.
     * </pre>
     */
    public void listPostEdits(patches.v1.Posts.ListPostEditsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.ListPostEditsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListPostEditsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Pins one of the caller's own posts to their profile. Up to 3 pinned posts per actor
     * (spec §188); `position` (0-2) sets display order.
     * </pre>
     */
    public void pinPost(patches.v1.Posts.PinPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.PinPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPinPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unpinning a post that isn't pinned is not an error.
     * </pre>
     */
    public void unpinPost(patches.v1.Posts.UnpinPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.UnpinPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnpinPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Full-text search over local post bodies (Postgres `websearch_to_tsquery`). Results are
     * strictly newest-first, keyset-paged like every other list RPC — there is no relevance
     * score and never a `sort`/`order` parameter (spec §194).
     * </pre>
     */
    public void searchPosts(patches.v1.Posts.SearchPostsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Posts.SearchPostsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSearchPostsMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service PostService.
   * <pre>
   * Posts and replies — there is no separate comment entity (spec §23–26, §51).
   * </pre>
   */
  public static final class PostServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<PostServiceBlockingV2Stub> {
    private PostServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PostServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PostServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Requires `client_request_id` (spec §45); the backend enforces idempotency conceptually
     * on (author_actor_id, client_request_id) so a client-side retry cannot create a
     * duplicate post.
     * </pre>
     */
    public patches.v1.Posts.CreatePostResponse createPost(patches.v1.Posts.CreatePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreatePostMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Posts.GetPostResponse getPost(patches.v1.Posts.GetPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Soft delete/tombstone (spec §25) — never a hard delete over this API.
     * </pre>
     */
    public patches.v1.Posts.DeletePostResponse deletePost(patches.v1.Posts.DeletePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getDeletePostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cursor-paginated, depth-bounded thread read (spec §24). Never loads an arbitrarily large
     * thread in one call.
     * </pre>
     */
    public patches.v1.Posts.ListRepliesResponse listReplies(patches.v1.Posts.ListRepliesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListRepliesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * In-place body/content-warning/media edit (spec §189, §26 amended). Up to 20 edits per
     * post (spec §188); every edit is snapshotted to `post_edits` before it is applied, readable
     * via `ListPostEdits`.
     * </pre>
     */
    public patches.v1.Posts.EditPostResponse editPost(patches.v1.Posts.EditPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getEditPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The edit history of a post, most-recent first.
     * </pre>
     */
    public patches.v1.Posts.ListPostEditsResponse listPostEdits(patches.v1.Posts.ListPostEditsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPostEditsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Pins one of the caller's own posts to their profile. Up to 3 pinned posts per actor
     * (spec §188); `position` (0-2) sets display order.
     * </pre>
     */
    public patches.v1.Posts.PinPostResponse pinPost(patches.v1.Posts.PinPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPinPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unpinning a post that isn't pinned is not an error.
     * </pre>
     */
    public patches.v1.Posts.UnpinPostResponse unpinPost(patches.v1.Posts.UnpinPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnpinPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Full-text search over local post bodies (Postgres `websearch_to_tsquery`). Results are
     * strictly newest-first, keyset-paged like every other list RPC — there is no relevance
     * score and never a `sort`/`order` parameter (spec §194).
     * </pre>
     */
    public patches.v1.Posts.SearchPostsResponse searchPosts(patches.v1.Posts.SearchPostsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSearchPostsMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service PostService.
   * <pre>
   * Posts and replies — there is no separate comment entity (spec §23–26, §51).
   * </pre>
   */
  public static final class PostServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<PostServiceBlockingStub> {
    private PostServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PostServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PostServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Requires `client_request_id` (spec §45); the backend enforces idempotency conceptually
     * on (author_actor_id, client_request_id) so a client-side retry cannot create a
     * duplicate post.
     * </pre>
     */
    public patches.v1.Posts.CreatePostResponse createPost(patches.v1.Posts.CreatePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreatePostMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Posts.GetPostResponse getPost(patches.v1.Posts.GetPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Soft delete/tombstone (spec §25) — never a hard delete over this API.
     * </pre>
     */
    public patches.v1.Posts.DeletePostResponse deletePost(patches.v1.Posts.DeletePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getDeletePostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cursor-paginated, depth-bounded thread read (spec §24). Never loads an arbitrarily large
     * thread in one call.
     * </pre>
     */
    public patches.v1.Posts.ListRepliesResponse listReplies(patches.v1.Posts.ListRepliesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListRepliesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * In-place body/content-warning/media edit (spec §189, §26 amended). Up to 20 edits per
     * post (spec §188); every edit is snapshotted to `post_edits` before it is applied, readable
     * via `ListPostEdits`.
     * </pre>
     */
    public patches.v1.Posts.EditPostResponse editPost(patches.v1.Posts.EditPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getEditPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The edit history of a post, most-recent first.
     * </pre>
     */
    public patches.v1.Posts.ListPostEditsResponse listPostEdits(patches.v1.Posts.ListPostEditsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPostEditsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Pins one of the caller's own posts to their profile. Up to 3 pinned posts per actor
     * (spec §188); `position` (0-2) sets display order.
     * </pre>
     */
    public patches.v1.Posts.PinPostResponse pinPost(patches.v1.Posts.PinPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPinPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unpinning a post that isn't pinned is not an error.
     * </pre>
     */
    public patches.v1.Posts.UnpinPostResponse unpinPost(patches.v1.Posts.UnpinPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnpinPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Full-text search over local post bodies (Postgres `websearch_to_tsquery`). Results are
     * strictly newest-first, keyset-paged like every other list RPC — there is no relevance
     * score and never a `sort`/`order` parameter (spec §194).
     * </pre>
     */
    public patches.v1.Posts.SearchPostsResponse searchPosts(patches.v1.Posts.SearchPostsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSearchPostsMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service PostService.
   * <pre>
   * Posts and replies — there is no separate comment entity (spec §23–26, §51).
   * </pre>
   */
  public static final class PostServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<PostServiceFutureStub> {
    private PostServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PostServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PostServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Requires `client_request_id` (spec §45); the backend enforces idempotency conceptually
     * on (author_actor_id, client_request_id) so a client-side retry cannot create a
     * duplicate post.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.CreatePostResponse> createPost(
        patches.v1.Posts.CreatePostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreatePostMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.GetPostResponse> getPost(
        patches.v1.Posts.GetPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Soft delete/tombstone (spec §25) — never a hard delete over this API.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.DeletePostResponse> deletePost(
        patches.v1.Posts.DeletePostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getDeletePostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Cursor-paginated, depth-bounded thread read (spec §24). Never loads an arbitrarily large
     * thread in one call.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.ListRepliesResponse> listReplies(
        patches.v1.Posts.ListRepliesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListRepliesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * In-place body/content-warning/media edit (spec §189, §26 amended). Up to 20 edits per
     * post (spec §188); every edit is snapshotted to `post_edits` before it is applied, readable
     * via `ListPostEdits`.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.EditPostResponse> editPost(
        patches.v1.Posts.EditPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getEditPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The edit history of a post, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.ListPostEditsResponse> listPostEdits(
        patches.v1.Posts.ListPostEditsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListPostEditsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Pins one of the caller's own posts to their profile. Up to 3 pinned posts per actor
     * (spec §188); `position` (0-2) sets display order.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.PinPostResponse> pinPost(
        patches.v1.Posts.PinPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPinPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unpinning a post that isn't pinned is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.UnpinPostResponse> unpinPost(
        patches.v1.Posts.UnpinPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnpinPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Full-text search over local post bodies (Postgres `websearch_to_tsquery`). Results are
     * strictly newest-first, keyset-paged like every other list RPC — there is no relevance
     * score and never a `sort`/`order` parameter (spec §194).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Posts.SearchPostsResponse> searchPosts(
        patches.v1.Posts.SearchPostsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSearchPostsMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_CREATE_POST = 0;
  private static final int METHODID_GET_POST = 1;
  private static final int METHODID_DELETE_POST = 2;
  private static final int METHODID_LIST_REPLIES = 3;
  private static final int METHODID_EDIT_POST = 4;
  private static final int METHODID_LIST_POST_EDITS = 5;
  private static final int METHODID_PIN_POST = 6;
  private static final int METHODID_UNPIN_POST = 7;
  private static final int METHODID_SEARCH_POSTS = 8;

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
        case METHODID_CREATE_POST:
          serviceImpl.createPost((patches.v1.Posts.CreatePostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.CreatePostResponse>) responseObserver);
          break;
        case METHODID_GET_POST:
          serviceImpl.getPost((patches.v1.Posts.GetPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.GetPostResponse>) responseObserver);
          break;
        case METHODID_DELETE_POST:
          serviceImpl.deletePost((patches.v1.Posts.DeletePostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.DeletePostResponse>) responseObserver);
          break;
        case METHODID_LIST_REPLIES:
          serviceImpl.listReplies((patches.v1.Posts.ListRepliesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.ListRepliesResponse>) responseObserver);
          break;
        case METHODID_EDIT_POST:
          serviceImpl.editPost((patches.v1.Posts.EditPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.EditPostResponse>) responseObserver);
          break;
        case METHODID_LIST_POST_EDITS:
          serviceImpl.listPostEdits((patches.v1.Posts.ListPostEditsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.ListPostEditsResponse>) responseObserver);
          break;
        case METHODID_PIN_POST:
          serviceImpl.pinPost((patches.v1.Posts.PinPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.PinPostResponse>) responseObserver);
          break;
        case METHODID_UNPIN_POST:
          serviceImpl.unpinPost((patches.v1.Posts.UnpinPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.UnpinPostResponse>) responseObserver);
          break;
        case METHODID_SEARCH_POSTS:
          serviceImpl.searchPosts((patches.v1.Posts.SearchPostsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Posts.SearchPostsResponse>) responseObserver);
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
          getCreatePostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.CreatePostRequest,
              patches.v1.Posts.CreatePostResponse>(
                service, METHODID_CREATE_POST)))
        .addMethod(
          getGetPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.GetPostRequest,
              patches.v1.Posts.GetPostResponse>(
                service, METHODID_GET_POST)))
        .addMethod(
          getDeletePostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.DeletePostRequest,
              patches.v1.Posts.DeletePostResponse>(
                service, METHODID_DELETE_POST)))
        .addMethod(
          getListRepliesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.ListRepliesRequest,
              patches.v1.Posts.ListRepliesResponse>(
                service, METHODID_LIST_REPLIES)))
        .addMethod(
          getEditPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.EditPostRequest,
              patches.v1.Posts.EditPostResponse>(
                service, METHODID_EDIT_POST)))
        .addMethod(
          getListPostEditsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.ListPostEditsRequest,
              patches.v1.Posts.ListPostEditsResponse>(
                service, METHODID_LIST_POST_EDITS)))
        .addMethod(
          getPinPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.PinPostRequest,
              patches.v1.Posts.PinPostResponse>(
                service, METHODID_PIN_POST)))
        .addMethod(
          getUnpinPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.UnpinPostRequest,
              patches.v1.Posts.UnpinPostResponse>(
                service, METHODID_UNPIN_POST)))
        .addMethod(
          getSearchPostsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Posts.SearchPostsRequest,
              patches.v1.Posts.SearchPostsResponse>(
                service, METHODID_SEARCH_POSTS)))
        .build();
  }

  private static abstract class PostServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    PostServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Posts.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("PostService");
    }
  }

  private static final class PostServiceFileDescriptorSupplier
      extends PostServiceBaseDescriptorSupplier {
    PostServiceFileDescriptorSupplier() {}
  }

  private static final class PostServiceMethodDescriptorSupplier
      extends PostServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    PostServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (PostServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new PostServiceFileDescriptorSupplier())
              .addMethod(getCreatePostMethod())
              .addMethod(getGetPostMethod())
              .addMethod(getDeletePostMethod())
              .addMethod(getListRepliesMethod())
              .addMethod(getEditPostMethod())
              .addMethod(getListPostEditsMethod())
              .addMethod(getPinPostMethod())
              .addMethod(getUnpinPostMethod())
              .addMethod(getSearchPostsMethod())
              .build();
        }
      }
    }
    return result;
  }
}
