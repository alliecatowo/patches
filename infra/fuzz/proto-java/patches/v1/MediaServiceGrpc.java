package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Direct-to-object-storage media upload (spec §29–32, §54). Image bytes are never proxied
 * through Node (§30, §153): `BeginMediaUpload` returns a presigned PUT URL the client uploads
 * to directly, and the media worker (Phase 5, spec §139) processes the object server-side
 * after upload, flipping `MediaStatus` from PENDING to READY (or FAILED). This file defines
 * the contract only — see the media-server/worker task for the `MediaService`
 * controller/service implementation and for `posts.proto`'s eventual `MediaAttachment.
 * thumbnail_url`/`download_url` fields (already anticipated by that message's comment).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/media.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class MediaServiceGrpc {

  private MediaServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.MediaService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Media.BeginMediaUploadRequest,
      patches.v1.Media.BeginMediaUploadResponse> getBeginMediaUploadMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginMediaUpload",
      requestType = patches.v1.Media.BeginMediaUploadRequest.class,
      responseType = patches.v1.Media.BeginMediaUploadResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Media.BeginMediaUploadRequest,
      patches.v1.Media.BeginMediaUploadResponse> getBeginMediaUploadMethod() {
    io.grpc.MethodDescriptor<patches.v1.Media.BeginMediaUploadRequest, patches.v1.Media.BeginMediaUploadResponse> getBeginMediaUploadMethod;
    if ((getBeginMediaUploadMethod = MediaServiceGrpc.getBeginMediaUploadMethod) == null) {
      synchronized (MediaServiceGrpc.class) {
        if ((getBeginMediaUploadMethod = MediaServiceGrpc.getBeginMediaUploadMethod) == null) {
          MediaServiceGrpc.getBeginMediaUploadMethod = getBeginMediaUploadMethod =
              io.grpc.MethodDescriptor.<patches.v1.Media.BeginMediaUploadRequest, patches.v1.Media.BeginMediaUploadResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginMediaUpload"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Media.BeginMediaUploadRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Media.BeginMediaUploadResponse.getDefaultInstance()))
              .setSchemaDescriptor(new MediaServiceMethodDescriptorSupplier("BeginMediaUpload"))
              .build();
        }
      }
    }
    return getBeginMediaUploadMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Media.FinalizeMediaUploadRequest,
      patches.v1.Media.FinalizeMediaUploadResponse> getFinalizeMediaUploadMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "FinalizeMediaUpload",
      requestType = patches.v1.Media.FinalizeMediaUploadRequest.class,
      responseType = patches.v1.Media.FinalizeMediaUploadResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Media.FinalizeMediaUploadRequest,
      patches.v1.Media.FinalizeMediaUploadResponse> getFinalizeMediaUploadMethod() {
    io.grpc.MethodDescriptor<patches.v1.Media.FinalizeMediaUploadRequest, patches.v1.Media.FinalizeMediaUploadResponse> getFinalizeMediaUploadMethod;
    if ((getFinalizeMediaUploadMethod = MediaServiceGrpc.getFinalizeMediaUploadMethod) == null) {
      synchronized (MediaServiceGrpc.class) {
        if ((getFinalizeMediaUploadMethod = MediaServiceGrpc.getFinalizeMediaUploadMethod) == null) {
          MediaServiceGrpc.getFinalizeMediaUploadMethod = getFinalizeMediaUploadMethod =
              io.grpc.MethodDescriptor.<patches.v1.Media.FinalizeMediaUploadRequest, patches.v1.Media.FinalizeMediaUploadResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "FinalizeMediaUpload"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Media.FinalizeMediaUploadRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Media.FinalizeMediaUploadResponse.getDefaultInstance()))
              .setSchemaDescriptor(new MediaServiceMethodDescriptorSupplier("FinalizeMediaUpload"))
              .build();
        }
      }
    }
    return getFinalizeMediaUploadMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Media.GetMediaDownloadRequest,
      patches.v1.Media.GetMediaDownloadResponse> getGetMediaDownloadMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetMediaDownload",
      requestType = patches.v1.Media.GetMediaDownloadRequest.class,
      responseType = patches.v1.Media.GetMediaDownloadResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Media.GetMediaDownloadRequest,
      patches.v1.Media.GetMediaDownloadResponse> getGetMediaDownloadMethod() {
    io.grpc.MethodDescriptor<patches.v1.Media.GetMediaDownloadRequest, patches.v1.Media.GetMediaDownloadResponse> getGetMediaDownloadMethod;
    if ((getGetMediaDownloadMethod = MediaServiceGrpc.getGetMediaDownloadMethod) == null) {
      synchronized (MediaServiceGrpc.class) {
        if ((getGetMediaDownloadMethod = MediaServiceGrpc.getGetMediaDownloadMethod) == null) {
          MediaServiceGrpc.getGetMediaDownloadMethod = getGetMediaDownloadMethod =
              io.grpc.MethodDescriptor.<patches.v1.Media.GetMediaDownloadRequest, patches.v1.Media.GetMediaDownloadResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetMediaDownload"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Media.GetMediaDownloadRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Media.GetMediaDownloadResponse.getDefaultInstance()))
              .setSchemaDescriptor(new MediaServiceMethodDescriptorSupplier("GetMediaDownload"))
              .build();
        }
      }
    }
    return getGetMediaDownloadMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static MediaServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<MediaServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<MediaServiceStub>() {
        @java.lang.Override
        public MediaServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new MediaServiceStub(channel, callOptions);
        }
      };
    return MediaServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static MediaServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<MediaServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<MediaServiceBlockingV2Stub>() {
        @java.lang.Override
        public MediaServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new MediaServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return MediaServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static MediaServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<MediaServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<MediaServiceBlockingStub>() {
        @java.lang.Override
        public MediaServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new MediaServiceBlockingStub(channel, callOptions);
        }
      };
    return MediaServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static MediaServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<MediaServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<MediaServiceFutureStub>() {
        @java.lang.Override
        public MediaServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new MediaServiceFutureStub(channel, callOptions);
        }
      };
    return MediaServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Direct-to-object-storage media upload (spec §29–32, §54). Image bytes are never proxied
   * through Node (§30, §153): `BeginMediaUpload` returns a presigned PUT URL the client uploads
   * to directly, and the media worker (Phase 5, spec §139) processes the object server-side
   * after upload, flipping `MediaStatus` from PENDING to READY (or FAILED). This file defines
   * the contract only — see the media-server/worker task for the `MediaService`
   * controller/service implementation and for `posts.proto`'s eventual `MediaAttachment.
   * thumbnail_url`/`download_url` fields (already anticipated by that message's comment).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void beginMediaUpload(patches.v1.Media.BeginMediaUploadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Media.BeginMediaUploadResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginMediaUploadMethod(), responseObserver);
    }

    /**
     */
    default void finalizeMediaUpload(patches.v1.Media.FinalizeMediaUploadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Media.FinalizeMediaUploadResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getFinalizeMediaUploadMethod(), responseObserver);
    }

    /**
     */
    default void getMediaDownload(patches.v1.Media.GetMediaDownloadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Media.GetMediaDownloadResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetMediaDownloadMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service MediaService.
   * <pre>
   * Direct-to-object-storage media upload (spec §29–32, §54). Image bytes are never proxied
   * through Node (§30, §153): `BeginMediaUpload` returns a presigned PUT URL the client uploads
   * to directly, and the media worker (Phase 5, spec §139) processes the object server-side
   * after upload, flipping `MediaStatus` from PENDING to READY (or FAILED). This file defines
   * the contract only — see the media-server/worker task for the `MediaService`
   * controller/service implementation and for `posts.proto`'s eventual `MediaAttachment.
   * thumbnail_url`/`download_url` fields (already anticipated by that message's comment).
   * </pre>
   */
  public static abstract class MediaServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return MediaServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service MediaService.
   * <pre>
   * Direct-to-object-storage media upload (spec §29–32, §54). Image bytes are never proxied
   * through Node (§30, §153): `BeginMediaUpload` returns a presigned PUT URL the client uploads
   * to directly, and the media worker (Phase 5, spec §139) processes the object server-side
   * after upload, flipping `MediaStatus` from PENDING to READY (or FAILED). This file defines
   * the contract only — see the media-server/worker task for the `MediaService`
   * controller/service implementation and for `posts.proto`'s eventual `MediaAttachment.
   * thumbnail_url`/`download_url` fields (already anticipated by that message's comment).
   * </pre>
   */
  public static final class MediaServiceStub
      extends io.grpc.stub.AbstractAsyncStub<MediaServiceStub> {
    private MediaServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected MediaServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new MediaServiceStub(channel, callOptions);
    }

    /**
     */
    public void beginMediaUpload(patches.v1.Media.BeginMediaUploadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Media.BeginMediaUploadResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginMediaUploadMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void finalizeMediaUpload(patches.v1.Media.FinalizeMediaUploadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Media.FinalizeMediaUploadResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getFinalizeMediaUploadMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getMediaDownload(patches.v1.Media.GetMediaDownloadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Media.GetMediaDownloadResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetMediaDownloadMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service MediaService.
   * <pre>
   * Direct-to-object-storage media upload (spec §29–32, §54). Image bytes are never proxied
   * through Node (§30, §153): `BeginMediaUpload` returns a presigned PUT URL the client uploads
   * to directly, and the media worker (Phase 5, spec §139) processes the object server-side
   * after upload, flipping `MediaStatus` from PENDING to READY (or FAILED). This file defines
   * the contract only — see the media-server/worker task for the `MediaService`
   * controller/service implementation and for `posts.proto`'s eventual `MediaAttachment.
   * thumbnail_url`/`download_url` fields (already anticipated by that message's comment).
   * </pre>
   */
  public static final class MediaServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<MediaServiceBlockingV2Stub> {
    private MediaServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected MediaServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new MediaServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Media.BeginMediaUploadResponse beginMediaUpload(patches.v1.Media.BeginMediaUploadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginMediaUploadMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Media.FinalizeMediaUploadResponse finalizeMediaUpload(patches.v1.Media.FinalizeMediaUploadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFinalizeMediaUploadMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Media.GetMediaDownloadResponse getMediaDownload(patches.v1.Media.GetMediaDownloadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetMediaDownloadMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service MediaService.
   * <pre>
   * Direct-to-object-storage media upload (spec §29–32, §54). Image bytes are never proxied
   * through Node (§30, §153): `BeginMediaUpload` returns a presigned PUT URL the client uploads
   * to directly, and the media worker (Phase 5, spec §139) processes the object server-side
   * after upload, flipping `MediaStatus` from PENDING to READY (or FAILED). This file defines
   * the contract only — see the media-server/worker task for the `MediaService`
   * controller/service implementation and for `posts.proto`'s eventual `MediaAttachment.
   * thumbnail_url`/`download_url` fields (already anticipated by that message's comment).
   * </pre>
   */
  public static final class MediaServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<MediaServiceBlockingStub> {
    private MediaServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected MediaServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new MediaServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Media.BeginMediaUploadResponse beginMediaUpload(patches.v1.Media.BeginMediaUploadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginMediaUploadMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Media.FinalizeMediaUploadResponse finalizeMediaUpload(patches.v1.Media.FinalizeMediaUploadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getFinalizeMediaUploadMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Media.GetMediaDownloadResponse getMediaDownload(patches.v1.Media.GetMediaDownloadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetMediaDownloadMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service MediaService.
   * <pre>
   * Direct-to-object-storage media upload (spec §29–32, §54). Image bytes are never proxied
   * through Node (§30, §153): `BeginMediaUpload` returns a presigned PUT URL the client uploads
   * to directly, and the media worker (Phase 5, spec §139) processes the object server-side
   * after upload, flipping `MediaStatus` from PENDING to READY (or FAILED). This file defines
   * the contract only — see the media-server/worker task for the `MediaService`
   * controller/service implementation and for `posts.proto`'s eventual `MediaAttachment.
   * thumbnail_url`/`download_url` fields (already anticipated by that message's comment).
   * </pre>
   */
  public static final class MediaServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<MediaServiceFutureStub> {
    private MediaServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected MediaServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new MediaServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Media.BeginMediaUploadResponse> beginMediaUpload(
        patches.v1.Media.BeginMediaUploadRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginMediaUploadMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Media.FinalizeMediaUploadResponse> finalizeMediaUpload(
        patches.v1.Media.FinalizeMediaUploadRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getFinalizeMediaUploadMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Media.GetMediaDownloadResponse> getMediaDownload(
        patches.v1.Media.GetMediaDownloadRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetMediaDownloadMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_BEGIN_MEDIA_UPLOAD = 0;
  private static final int METHODID_FINALIZE_MEDIA_UPLOAD = 1;
  private static final int METHODID_GET_MEDIA_DOWNLOAD = 2;

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
        case METHODID_BEGIN_MEDIA_UPLOAD:
          serviceImpl.beginMediaUpload((patches.v1.Media.BeginMediaUploadRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Media.BeginMediaUploadResponse>) responseObserver);
          break;
        case METHODID_FINALIZE_MEDIA_UPLOAD:
          serviceImpl.finalizeMediaUpload((patches.v1.Media.FinalizeMediaUploadRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Media.FinalizeMediaUploadResponse>) responseObserver);
          break;
        case METHODID_GET_MEDIA_DOWNLOAD:
          serviceImpl.getMediaDownload((patches.v1.Media.GetMediaDownloadRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Media.GetMediaDownloadResponse>) responseObserver);
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
          getBeginMediaUploadMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Media.BeginMediaUploadRequest,
              patches.v1.Media.BeginMediaUploadResponse>(
                service, METHODID_BEGIN_MEDIA_UPLOAD)))
        .addMethod(
          getFinalizeMediaUploadMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Media.FinalizeMediaUploadRequest,
              patches.v1.Media.FinalizeMediaUploadResponse>(
                service, METHODID_FINALIZE_MEDIA_UPLOAD)))
        .addMethod(
          getGetMediaDownloadMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Media.GetMediaDownloadRequest,
              patches.v1.Media.GetMediaDownloadResponse>(
                service, METHODID_GET_MEDIA_DOWNLOAD)))
        .build();
  }

  private static abstract class MediaServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    MediaServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Media.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("MediaService");
    }
  }

  private static final class MediaServiceFileDescriptorSupplier
      extends MediaServiceBaseDescriptorSupplier {
    MediaServiceFileDescriptorSupplier() {}
  }

  private static final class MediaServiceMethodDescriptorSupplier
      extends MediaServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    MediaServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (MediaServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new MediaServiceFileDescriptorSupplier())
              .addMethod(getBeginMediaUploadMethod())
              .addMethod(getFinalizeMediaUploadMethod())
              .addMethod(getGetMediaDownloadMethod())
              .build();
        }
      }
    }
    return result;
  }
}
