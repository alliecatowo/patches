package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Likes and bookmarks (spec §53). Bookmarks are private — never exposed on another actor's
 * view; `ListBookmarks` only ever returns the caller's own.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/reactions.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class ReactionServiceGrpc {

  private ReactionServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.ReactionService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.LikePostRequest,
      patches.v1.Reactions.LikePostResponse> getLikePostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "LikePost",
      requestType = patches.v1.Reactions.LikePostRequest.class,
      responseType = patches.v1.Reactions.LikePostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.LikePostRequest,
      patches.v1.Reactions.LikePostResponse> getLikePostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.LikePostRequest, patches.v1.Reactions.LikePostResponse> getLikePostMethod;
    if ((getLikePostMethod = ReactionServiceGrpc.getLikePostMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getLikePostMethod = ReactionServiceGrpc.getLikePostMethod) == null) {
          ReactionServiceGrpc.getLikePostMethod = getLikePostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.LikePostRequest, patches.v1.Reactions.LikePostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "LikePost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.LikePostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.LikePostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("LikePost"))
              .build();
        }
      }
    }
    return getLikePostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.UnlikePostRequest,
      patches.v1.Reactions.UnlikePostResponse> getUnlikePostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnlikePost",
      requestType = patches.v1.Reactions.UnlikePostRequest.class,
      responseType = patches.v1.Reactions.UnlikePostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.UnlikePostRequest,
      patches.v1.Reactions.UnlikePostResponse> getUnlikePostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.UnlikePostRequest, patches.v1.Reactions.UnlikePostResponse> getUnlikePostMethod;
    if ((getUnlikePostMethod = ReactionServiceGrpc.getUnlikePostMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getUnlikePostMethod = ReactionServiceGrpc.getUnlikePostMethod) == null) {
          ReactionServiceGrpc.getUnlikePostMethod = getUnlikePostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.UnlikePostRequest, patches.v1.Reactions.UnlikePostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnlikePost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.UnlikePostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.UnlikePostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("UnlikePost"))
              .build();
        }
      }
    }
    return getUnlikePostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.BookmarkPostRequest,
      patches.v1.Reactions.BookmarkPostResponse> getBookmarkPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BookmarkPost",
      requestType = patches.v1.Reactions.BookmarkPostRequest.class,
      responseType = patches.v1.Reactions.BookmarkPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.BookmarkPostRequest,
      patches.v1.Reactions.BookmarkPostResponse> getBookmarkPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.BookmarkPostRequest, patches.v1.Reactions.BookmarkPostResponse> getBookmarkPostMethod;
    if ((getBookmarkPostMethod = ReactionServiceGrpc.getBookmarkPostMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getBookmarkPostMethod = ReactionServiceGrpc.getBookmarkPostMethod) == null) {
          ReactionServiceGrpc.getBookmarkPostMethod = getBookmarkPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.BookmarkPostRequest, patches.v1.Reactions.BookmarkPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BookmarkPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.BookmarkPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.BookmarkPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("BookmarkPost"))
              .build();
        }
      }
    }
    return getBookmarkPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.UnbookmarkPostRequest,
      patches.v1.Reactions.UnbookmarkPostResponse> getUnbookmarkPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnbookmarkPost",
      requestType = patches.v1.Reactions.UnbookmarkPostRequest.class,
      responseType = patches.v1.Reactions.UnbookmarkPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.UnbookmarkPostRequest,
      patches.v1.Reactions.UnbookmarkPostResponse> getUnbookmarkPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.UnbookmarkPostRequest, patches.v1.Reactions.UnbookmarkPostResponse> getUnbookmarkPostMethod;
    if ((getUnbookmarkPostMethod = ReactionServiceGrpc.getUnbookmarkPostMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getUnbookmarkPostMethod = ReactionServiceGrpc.getUnbookmarkPostMethod) == null) {
          ReactionServiceGrpc.getUnbookmarkPostMethod = getUnbookmarkPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.UnbookmarkPostRequest, patches.v1.Reactions.UnbookmarkPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnbookmarkPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.UnbookmarkPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.UnbookmarkPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("UnbookmarkPost"))
              .build();
        }
      }
    }
    return getUnbookmarkPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.ListBookmarksRequest,
      patches.v1.Reactions.ListBookmarksResponse> getListBookmarksMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListBookmarks",
      requestType = patches.v1.Reactions.ListBookmarksRequest.class,
      responseType = patches.v1.Reactions.ListBookmarksResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.ListBookmarksRequest,
      patches.v1.Reactions.ListBookmarksResponse> getListBookmarksMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.ListBookmarksRequest, patches.v1.Reactions.ListBookmarksResponse> getListBookmarksMethod;
    if ((getListBookmarksMethod = ReactionServiceGrpc.getListBookmarksMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getListBookmarksMethod = ReactionServiceGrpc.getListBookmarksMethod) == null) {
          ReactionServiceGrpc.getListBookmarksMethod = getListBookmarksMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.ListBookmarksRequest, patches.v1.Reactions.ListBookmarksResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListBookmarks"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.ListBookmarksRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.ListBookmarksResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("ListBookmarks"))
              .build();
        }
      }
    }
    return getListBookmarksMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.ListPostLikersRequest,
      patches.v1.Reactions.ListPostLikersResponse> getListPostLikersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListPostLikers",
      requestType = patches.v1.Reactions.ListPostLikersRequest.class,
      responseType = patches.v1.Reactions.ListPostLikersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.ListPostLikersRequest,
      patches.v1.Reactions.ListPostLikersResponse> getListPostLikersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.ListPostLikersRequest, patches.v1.Reactions.ListPostLikersResponse> getListPostLikersMethod;
    if ((getListPostLikersMethod = ReactionServiceGrpc.getListPostLikersMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getListPostLikersMethod = ReactionServiceGrpc.getListPostLikersMethod) == null) {
          ReactionServiceGrpc.getListPostLikersMethod = getListPostLikersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.ListPostLikersRequest, patches.v1.Reactions.ListPostLikersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListPostLikers"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.ListPostLikersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.ListPostLikersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("ListPostLikers"))
              .build();
        }
      }
    }
    return getListPostLikersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.RepostPostRequest,
      patches.v1.Reactions.RepostPostResponse> getRepostPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RepostPost",
      requestType = patches.v1.Reactions.RepostPostRequest.class,
      responseType = patches.v1.Reactions.RepostPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.RepostPostRequest,
      patches.v1.Reactions.RepostPostResponse> getRepostPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.RepostPostRequest, patches.v1.Reactions.RepostPostResponse> getRepostPostMethod;
    if ((getRepostPostMethod = ReactionServiceGrpc.getRepostPostMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getRepostPostMethod = ReactionServiceGrpc.getRepostPostMethod) == null) {
          ReactionServiceGrpc.getRepostPostMethod = getRepostPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.RepostPostRequest, patches.v1.Reactions.RepostPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RepostPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.RepostPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.RepostPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("RepostPost"))
              .build();
        }
      }
    }
    return getRepostPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.UnrepostPostRequest,
      patches.v1.Reactions.UnrepostPostResponse> getUnrepostPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnrepostPost",
      requestType = patches.v1.Reactions.UnrepostPostRequest.class,
      responseType = patches.v1.Reactions.UnrepostPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.UnrepostPostRequest,
      patches.v1.Reactions.UnrepostPostResponse> getUnrepostPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.UnrepostPostRequest, patches.v1.Reactions.UnrepostPostResponse> getUnrepostPostMethod;
    if ((getUnrepostPostMethod = ReactionServiceGrpc.getUnrepostPostMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getUnrepostPostMethod = ReactionServiceGrpc.getUnrepostPostMethod) == null) {
          ReactionServiceGrpc.getUnrepostPostMethod = getUnrepostPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.UnrepostPostRequest, patches.v1.Reactions.UnrepostPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnrepostPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.UnrepostPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.UnrepostPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("UnrepostPost"))
              .build();
        }
      }
    }
    return getUnrepostPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Reactions.ListPostRepostersRequest,
      patches.v1.Reactions.ListPostRepostersResponse> getListPostRepostersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListPostReposters",
      requestType = patches.v1.Reactions.ListPostRepostersRequest.class,
      responseType = patches.v1.Reactions.ListPostRepostersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Reactions.ListPostRepostersRequest,
      patches.v1.Reactions.ListPostRepostersResponse> getListPostRepostersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Reactions.ListPostRepostersRequest, patches.v1.Reactions.ListPostRepostersResponse> getListPostRepostersMethod;
    if ((getListPostRepostersMethod = ReactionServiceGrpc.getListPostRepostersMethod) == null) {
      synchronized (ReactionServiceGrpc.class) {
        if ((getListPostRepostersMethod = ReactionServiceGrpc.getListPostRepostersMethod) == null) {
          ReactionServiceGrpc.getListPostRepostersMethod = getListPostRepostersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Reactions.ListPostRepostersRequest, patches.v1.Reactions.ListPostRepostersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListPostReposters"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.ListPostRepostersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Reactions.ListPostRepostersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ReactionServiceMethodDescriptorSupplier("ListPostReposters"))
              .build();
        }
      }
    }
    return getListPostRepostersMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static ReactionServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ReactionServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ReactionServiceStub>() {
        @java.lang.Override
        public ReactionServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ReactionServiceStub(channel, callOptions);
        }
      };
    return ReactionServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static ReactionServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ReactionServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ReactionServiceBlockingV2Stub>() {
        @java.lang.Override
        public ReactionServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ReactionServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return ReactionServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static ReactionServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ReactionServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ReactionServiceBlockingStub>() {
        @java.lang.Override
        public ReactionServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ReactionServiceBlockingStub(channel, callOptions);
        }
      };
    return ReactionServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static ReactionServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ReactionServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ReactionServiceFutureStub>() {
        @java.lang.Override
        public ReactionServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ReactionServiceFutureStub(channel, callOptions);
        }
      };
    return ReactionServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Likes and bookmarks (spec §53). Bookmarks are private — never exposed on another actor's
   * view; `ListBookmarks` only ever returns the caller's own.
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void likePost(patches.v1.Reactions.LikePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.LikePostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getLikePostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unliking a post the caller has not liked is not an error.
     * </pre>
     */
    default void unlikePost(patches.v1.Reactions.UnlikePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.UnlikePostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnlikePostMethod(), responseObserver);
    }

    /**
     */
    default void bookmarkPost(patches.v1.Reactions.BookmarkPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.BookmarkPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBookmarkPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unbookmarking a post the caller has not bookmarked is not an error.
     * </pre>
     */
    default void unbookmarkPost(patches.v1.Reactions.UnbookmarkPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.UnbookmarkPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnbookmarkPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own bookmarks, most-recent first (spec §52 MVP note, §53). Requires an
     * authenticated session — there is no such thing as an anonymous bookmark list.
     * </pre>
     */
    default void listBookmarks(patches.v1.Reactions.ListBookmarksRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.ListBookmarksResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListBookmarksMethod(), responseObserver);
    }

    /**
     * <pre>
     * Actors who liked a post, most-recent first.
     * </pre>
     */
    default void listPostLikers(patches.v1.Reactions.ListPostLikersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.ListPostLikersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListPostLikersMethod(), responseObserver);
    }

    /**
     * <pre>
     * A repost is a pointer row like a like or a bookmark (spec §190) — it never duplicates the
     * post's content.
     * </pre>
     */
    default void repostPost(patches.v1.Reactions.RepostPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.RepostPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRepostPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unreposting a post the caller hasn't reposted is not an error.
     * </pre>
     */
    default void unrepostPost(patches.v1.Reactions.UnrepostPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.UnrepostPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnrepostPostMethod(), responseObserver);
    }

    /**
     * <pre>
     * Actors who reposted a post, most-recent first.
     * </pre>
     */
    default void listPostReposters(patches.v1.Reactions.ListPostRepostersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.ListPostRepostersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListPostRepostersMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service ReactionService.
   * <pre>
   * Likes and bookmarks (spec §53). Bookmarks are private — never exposed on another actor's
   * view; `ListBookmarks` only ever returns the caller's own.
   * </pre>
   */
  public static abstract class ReactionServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return ReactionServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service ReactionService.
   * <pre>
   * Likes and bookmarks (spec §53). Bookmarks are private — never exposed on another actor's
   * view; `ListBookmarks` only ever returns the caller's own.
   * </pre>
   */
  public static final class ReactionServiceStub
      extends io.grpc.stub.AbstractAsyncStub<ReactionServiceStub> {
    private ReactionServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ReactionServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ReactionServiceStub(channel, callOptions);
    }

    /**
     */
    public void likePost(patches.v1.Reactions.LikePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.LikePostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getLikePostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unliking a post the caller has not liked is not an error.
     * </pre>
     */
    public void unlikePost(patches.v1.Reactions.UnlikePostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.UnlikePostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnlikePostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void bookmarkPost(patches.v1.Reactions.BookmarkPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.BookmarkPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBookmarkPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unbookmarking a post the caller has not bookmarked is not an error.
     * </pre>
     */
    public void unbookmarkPost(patches.v1.Reactions.UnbookmarkPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.UnbookmarkPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnbookmarkPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own bookmarks, most-recent first (spec §52 MVP note, §53). Requires an
     * authenticated session — there is no such thing as an anonymous bookmark list.
     * </pre>
     */
    public void listBookmarks(patches.v1.Reactions.ListBookmarksRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.ListBookmarksResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListBookmarksMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Actors who liked a post, most-recent first.
     * </pre>
     */
    public void listPostLikers(patches.v1.Reactions.ListPostLikersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.ListPostLikersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListPostLikersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * A repost is a pointer row like a like or a bookmark (spec §190) — it never duplicates the
     * post's content.
     * </pre>
     */
    public void repostPost(patches.v1.Reactions.RepostPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.RepostPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRepostPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unreposting a post the caller hasn't reposted is not an error.
     * </pre>
     */
    public void unrepostPost(patches.v1.Reactions.UnrepostPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.UnrepostPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnrepostPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Actors who reposted a post, most-recent first.
     * </pre>
     */
    public void listPostReposters(patches.v1.Reactions.ListPostRepostersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Reactions.ListPostRepostersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListPostRepostersMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service ReactionService.
   * <pre>
   * Likes and bookmarks (spec §53). Bookmarks are private — never exposed on another actor's
   * view; `ListBookmarks` only ever returns the caller's own.
   * </pre>
   */
  public static final class ReactionServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<ReactionServiceBlockingV2Stub> {
    private ReactionServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ReactionServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ReactionServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Reactions.LikePostResponse likePost(patches.v1.Reactions.LikePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLikePostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unliking a post the caller has not liked is not an error.
     * </pre>
     */
    public patches.v1.Reactions.UnlikePostResponse unlikePost(patches.v1.Reactions.UnlikePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnlikePostMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Reactions.BookmarkPostResponse bookmarkPost(patches.v1.Reactions.BookmarkPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBookmarkPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unbookmarking a post the caller has not bookmarked is not an error.
     * </pre>
     */
    public patches.v1.Reactions.UnbookmarkPostResponse unbookmarkPost(patches.v1.Reactions.UnbookmarkPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnbookmarkPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own bookmarks, most-recent first (spec §52 MVP note, §53). Requires an
     * authenticated session — there is no such thing as an anonymous bookmark list.
     * </pre>
     */
    public patches.v1.Reactions.ListBookmarksResponse listBookmarks(patches.v1.Reactions.ListBookmarksRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListBookmarksMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Actors who liked a post, most-recent first.
     * </pre>
     */
    public patches.v1.Reactions.ListPostLikersResponse listPostLikers(patches.v1.Reactions.ListPostLikersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPostLikersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A repost is a pointer row like a like or a bookmark (spec §190) — it never duplicates the
     * post's content.
     * </pre>
     */
    public patches.v1.Reactions.RepostPostResponse repostPost(patches.v1.Reactions.RepostPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRepostPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unreposting a post the caller hasn't reposted is not an error.
     * </pre>
     */
    public patches.v1.Reactions.UnrepostPostResponse unrepostPost(patches.v1.Reactions.UnrepostPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnrepostPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Actors who reposted a post, most-recent first.
     * </pre>
     */
    public patches.v1.Reactions.ListPostRepostersResponse listPostReposters(patches.v1.Reactions.ListPostRepostersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPostRepostersMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service ReactionService.
   * <pre>
   * Likes and bookmarks (spec §53). Bookmarks are private — never exposed on another actor's
   * view; `ListBookmarks` only ever returns the caller's own.
   * </pre>
   */
  public static final class ReactionServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<ReactionServiceBlockingStub> {
    private ReactionServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ReactionServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ReactionServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Reactions.LikePostResponse likePost(patches.v1.Reactions.LikePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLikePostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unliking a post the caller has not liked is not an error.
     * </pre>
     */
    public patches.v1.Reactions.UnlikePostResponse unlikePost(patches.v1.Reactions.UnlikePostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnlikePostMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Reactions.BookmarkPostResponse bookmarkPost(patches.v1.Reactions.BookmarkPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBookmarkPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unbookmarking a post the caller has not bookmarked is not an error.
     * </pre>
     */
    public patches.v1.Reactions.UnbookmarkPostResponse unbookmarkPost(patches.v1.Reactions.UnbookmarkPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnbookmarkPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own bookmarks, most-recent first (spec §52 MVP note, §53). Requires an
     * authenticated session — there is no such thing as an anonymous bookmark list.
     * </pre>
     */
    public patches.v1.Reactions.ListBookmarksResponse listBookmarks(patches.v1.Reactions.ListBookmarksRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListBookmarksMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Actors who liked a post, most-recent first.
     * </pre>
     */
    public patches.v1.Reactions.ListPostLikersResponse listPostLikers(patches.v1.Reactions.ListPostLikersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPostLikersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A repost is a pointer row like a like or a bookmark (spec §190) — it never duplicates the
     * post's content.
     * </pre>
     */
    public patches.v1.Reactions.RepostPostResponse repostPost(patches.v1.Reactions.RepostPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRepostPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unreposting a post the caller hasn't reposted is not an error.
     * </pre>
     */
    public patches.v1.Reactions.UnrepostPostResponse unrepostPost(patches.v1.Reactions.UnrepostPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnrepostPostMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Actors who reposted a post, most-recent first.
     * </pre>
     */
    public patches.v1.Reactions.ListPostRepostersResponse listPostReposters(patches.v1.Reactions.ListPostRepostersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPostRepostersMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service ReactionService.
   * <pre>
   * Likes and bookmarks (spec §53). Bookmarks are private — never exposed on another actor's
   * view; `ListBookmarks` only ever returns the caller's own.
   * </pre>
   */
  public static final class ReactionServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<ReactionServiceFutureStub> {
    private ReactionServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ReactionServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ReactionServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.LikePostResponse> likePost(
        patches.v1.Reactions.LikePostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getLikePostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unliking a post the caller has not liked is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.UnlikePostResponse> unlikePost(
        patches.v1.Reactions.UnlikePostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnlikePostMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.BookmarkPostResponse> bookmarkPost(
        patches.v1.Reactions.BookmarkPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBookmarkPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unbookmarking a post the caller has not bookmarked is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.UnbookmarkPostResponse> unbookmarkPost(
        patches.v1.Reactions.UnbookmarkPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnbookmarkPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own bookmarks, most-recent first (spec §52 MVP note, §53). Requires an
     * authenticated session — there is no such thing as an anonymous bookmark list.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.ListBookmarksResponse> listBookmarks(
        patches.v1.Reactions.ListBookmarksRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListBookmarksMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Actors who liked a post, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.ListPostLikersResponse> listPostLikers(
        patches.v1.Reactions.ListPostLikersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListPostLikersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * A repost is a pointer row like a like or a bookmark (spec §190) — it never duplicates the
     * post's content.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.RepostPostResponse> repostPost(
        patches.v1.Reactions.RepostPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRepostPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unreposting a post the caller hasn't reposted is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.UnrepostPostResponse> unrepostPost(
        patches.v1.Reactions.UnrepostPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnrepostPostMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Actors who reposted a post, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Reactions.ListPostRepostersResponse> listPostReposters(
        patches.v1.Reactions.ListPostRepostersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListPostRepostersMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_LIKE_POST = 0;
  private static final int METHODID_UNLIKE_POST = 1;
  private static final int METHODID_BOOKMARK_POST = 2;
  private static final int METHODID_UNBOOKMARK_POST = 3;
  private static final int METHODID_LIST_BOOKMARKS = 4;
  private static final int METHODID_LIST_POST_LIKERS = 5;
  private static final int METHODID_REPOST_POST = 6;
  private static final int METHODID_UNREPOST_POST = 7;
  private static final int METHODID_LIST_POST_REPOSTERS = 8;

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
        case METHODID_LIKE_POST:
          serviceImpl.likePost((patches.v1.Reactions.LikePostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.LikePostResponse>) responseObserver);
          break;
        case METHODID_UNLIKE_POST:
          serviceImpl.unlikePost((patches.v1.Reactions.UnlikePostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.UnlikePostResponse>) responseObserver);
          break;
        case METHODID_BOOKMARK_POST:
          serviceImpl.bookmarkPost((patches.v1.Reactions.BookmarkPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.BookmarkPostResponse>) responseObserver);
          break;
        case METHODID_UNBOOKMARK_POST:
          serviceImpl.unbookmarkPost((patches.v1.Reactions.UnbookmarkPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.UnbookmarkPostResponse>) responseObserver);
          break;
        case METHODID_LIST_BOOKMARKS:
          serviceImpl.listBookmarks((patches.v1.Reactions.ListBookmarksRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.ListBookmarksResponse>) responseObserver);
          break;
        case METHODID_LIST_POST_LIKERS:
          serviceImpl.listPostLikers((patches.v1.Reactions.ListPostLikersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.ListPostLikersResponse>) responseObserver);
          break;
        case METHODID_REPOST_POST:
          serviceImpl.repostPost((patches.v1.Reactions.RepostPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.RepostPostResponse>) responseObserver);
          break;
        case METHODID_UNREPOST_POST:
          serviceImpl.unrepostPost((patches.v1.Reactions.UnrepostPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.UnrepostPostResponse>) responseObserver);
          break;
        case METHODID_LIST_POST_REPOSTERS:
          serviceImpl.listPostReposters((patches.v1.Reactions.ListPostRepostersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Reactions.ListPostRepostersResponse>) responseObserver);
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
          getLikePostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.LikePostRequest,
              patches.v1.Reactions.LikePostResponse>(
                service, METHODID_LIKE_POST)))
        .addMethod(
          getUnlikePostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.UnlikePostRequest,
              patches.v1.Reactions.UnlikePostResponse>(
                service, METHODID_UNLIKE_POST)))
        .addMethod(
          getBookmarkPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.BookmarkPostRequest,
              patches.v1.Reactions.BookmarkPostResponse>(
                service, METHODID_BOOKMARK_POST)))
        .addMethod(
          getUnbookmarkPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.UnbookmarkPostRequest,
              patches.v1.Reactions.UnbookmarkPostResponse>(
                service, METHODID_UNBOOKMARK_POST)))
        .addMethod(
          getListBookmarksMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.ListBookmarksRequest,
              patches.v1.Reactions.ListBookmarksResponse>(
                service, METHODID_LIST_BOOKMARKS)))
        .addMethod(
          getListPostLikersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.ListPostLikersRequest,
              patches.v1.Reactions.ListPostLikersResponse>(
                service, METHODID_LIST_POST_LIKERS)))
        .addMethod(
          getRepostPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.RepostPostRequest,
              patches.v1.Reactions.RepostPostResponse>(
                service, METHODID_REPOST_POST)))
        .addMethod(
          getUnrepostPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.UnrepostPostRequest,
              patches.v1.Reactions.UnrepostPostResponse>(
                service, METHODID_UNREPOST_POST)))
        .addMethod(
          getListPostRepostersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Reactions.ListPostRepostersRequest,
              patches.v1.Reactions.ListPostRepostersResponse>(
                service, METHODID_LIST_POST_REPOSTERS)))
        .build();
  }

  private static abstract class ReactionServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    ReactionServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Reactions.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("ReactionService");
    }
  }

  private static final class ReactionServiceFileDescriptorSupplier
      extends ReactionServiceBaseDescriptorSupplier {
    ReactionServiceFileDescriptorSupplier() {}
  }

  private static final class ReactionServiceMethodDescriptorSupplier
      extends ReactionServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    ReactionServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (ReactionServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new ReactionServiceFileDescriptorSupplier())
              .addMethod(getLikePostMethod())
              .addMethod(getUnlikePostMethod())
              .addMethod(getBookmarkPostMethod())
              .addMethod(getUnbookmarkPostMethod())
              .addMethod(getListBookmarksMethod())
              .addMethod(getListPostLikersMethod())
              .addMethod(getRepostPostMethod())
              .addMethod(getUnrepostPostMethod())
              .addMethod(getListPostRepostersMethod())
              .build();
        }
      }
    }
    return result;
  }
}
