package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
 * preferences, account data export, and account deletion with a grace period. None of these
 * functions is ever gated on a paid capability (§174, §184.3, §208).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/privacy.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class PrivacyServiceGrpc {

  private PrivacyServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.PrivacyService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.AcknowledgePrivacyNoticeRequest,
      patches.v1.Privacy.AcknowledgePrivacyNoticeResponse> getAcknowledgePrivacyNoticeMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AcknowledgePrivacyNotice",
      requestType = patches.v1.Privacy.AcknowledgePrivacyNoticeRequest.class,
      responseType = patches.v1.Privacy.AcknowledgePrivacyNoticeResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.AcknowledgePrivacyNoticeRequest,
      patches.v1.Privacy.AcknowledgePrivacyNoticeResponse> getAcknowledgePrivacyNoticeMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.AcknowledgePrivacyNoticeRequest, patches.v1.Privacy.AcknowledgePrivacyNoticeResponse> getAcknowledgePrivacyNoticeMethod;
    if ((getAcknowledgePrivacyNoticeMethod = PrivacyServiceGrpc.getAcknowledgePrivacyNoticeMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getAcknowledgePrivacyNoticeMethod = PrivacyServiceGrpc.getAcknowledgePrivacyNoticeMethod) == null) {
          PrivacyServiceGrpc.getAcknowledgePrivacyNoticeMethod = getAcknowledgePrivacyNoticeMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.AcknowledgePrivacyNoticeRequest, patches.v1.Privacy.AcknowledgePrivacyNoticeResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AcknowledgePrivacyNotice"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.AcknowledgePrivacyNoticeRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.AcknowledgePrivacyNoticeResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("AcknowledgePrivacyNotice"))
              .build();
        }
      }
    }
    return getAcknowledgePrivacyNoticeMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.GetPrivacyPrefsRequest,
      patches.v1.Privacy.GetPrivacyPrefsResponse> getGetPrivacyPrefsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetPrivacyPrefs",
      requestType = patches.v1.Privacy.GetPrivacyPrefsRequest.class,
      responseType = patches.v1.Privacy.GetPrivacyPrefsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.GetPrivacyPrefsRequest,
      patches.v1.Privacy.GetPrivacyPrefsResponse> getGetPrivacyPrefsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.GetPrivacyPrefsRequest, patches.v1.Privacy.GetPrivacyPrefsResponse> getGetPrivacyPrefsMethod;
    if ((getGetPrivacyPrefsMethod = PrivacyServiceGrpc.getGetPrivacyPrefsMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getGetPrivacyPrefsMethod = PrivacyServiceGrpc.getGetPrivacyPrefsMethod) == null) {
          PrivacyServiceGrpc.getGetPrivacyPrefsMethod = getGetPrivacyPrefsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.GetPrivacyPrefsRequest, patches.v1.Privacy.GetPrivacyPrefsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetPrivacyPrefs"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.GetPrivacyPrefsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.GetPrivacyPrefsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("GetPrivacyPrefs"))
              .build();
        }
      }
    }
    return getGetPrivacyPrefsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.UpdatePrivacyPrefsRequest,
      patches.v1.Privacy.UpdatePrivacyPrefsResponse> getUpdatePrivacyPrefsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdatePrivacyPrefs",
      requestType = patches.v1.Privacy.UpdatePrivacyPrefsRequest.class,
      responseType = patches.v1.Privacy.UpdatePrivacyPrefsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.UpdatePrivacyPrefsRequest,
      patches.v1.Privacy.UpdatePrivacyPrefsResponse> getUpdatePrivacyPrefsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.UpdatePrivacyPrefsRequest, patches.v1.Privacy.UpdatePrivacyPrefsResponse> getUpdatePrivacyPrefsMethod;
    if ((getUpdatePrivacyPrefsMethod = PrivacyServiceGrpc.getUpdatePrivacyPrefsMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getUpdatePrivacyPrefsMethod = PrivacyServiceGrpc.getUpdatePrivacyPrefsMethod) == null) {
          PrivacyServiceGrpc.getUpdatePrivacyPrefsMethod = getUpdatePrivacyPrefsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.UpdatePrivacyPrefsRequest, patches.v1.Privacy.UpdatePrivacyPrefsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdatePrivacyPrefs"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.UpdatePrivacyPrefsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.UpdatePrivacyPrefsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("UpdatePrivacyPrefs"))
              .build();
        }
      }
    }
    return getUpdatePrivacyPrefsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.ExportAccountRequest,
      patches.v1.Privacy.ExportAccountResponse> getExportAccountMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ExportAccount",
      requestType = patches.v1.Privacy.ExportAccountRequest.class,
      responseType = patches.v1.Privacy.ExportAccountResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.ExportAccountRequest,
      patches.v1.Privacy.ExportAccountResponse> getExportAccountMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.ExportAccountRequest, patches.v1.Privacy.ExportAccountResponse> getExportAccountMethod;
    if ((getExportAccountMethod = PrivacyServiceGrpc.getExportAccountMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getExportAccountMethod = PrivacyServiceGrpc.getExportAccountMethod) == null) {
          PrivacyServiceGrpc.getExportAccountMethod = getExportAccountMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.ExportAccountRequest, patches.v1.Privacy.ExportAccountResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ExportAccount"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.ExportAccountRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.ExportAccountResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("ExportAccount"))
              .build();
        }
      }
    }
    return getExportAccountMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.GetExportStatusRequest,
      patches.v1.Privacy.GetExportStatusResponse> getGetExportStatusMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetExportStatus",
      requestType = patches.v1.Privacy.GetExportStatusRequest.class,
      responseType = patches.v1.Privacy.GetExportStatusResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.GetExportStatusRequest,
      patches.v1.Privacy.GetExportStatusResponse> getGetExportStatusMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.GetExportStatusRequest, patches.v1.Privacy.GetExportStatusResponse> getGetExportStatusMethod;
    if ((getGetExportStatusMethod = PrivacyServiceGrpc.getGetExportStatusMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getGetExportStatusMethod = PrivacyServiceGrpc.getGetExportStatusMethod) == null) {
          PrivacyServiceGrpc.getGetExportStatusMethod = getGetExportStatusMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.GetExportStatusRequest, patches.v1.Privacy.GetExportStatusResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetExportStatus"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.GetExportStatusRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.GetExportStatusResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("GetExportStatus"))
              .build();
        }
      }
    }
    return getGetExportStatusMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.RequestAccountDeletionRequest,
      patches.v1.Privacy.RequestAccountDeletionResponse> getRequestAccountDeletionMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RequestAccountDeletion",
      requestType = patches.v1.Privacy.RequestAccountDeletionRequest.class,
      responseType = patches.v1.Privacy.RequestAccountDeletionResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.RequestAccountDeletionRequest,
      patches.v1.Privacy.RequestAccountDeletionResponse> getRequestAccountDeletionMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.RequestAccountDeletionRequest, patches.v1.Privacy.RequestAccountDeletionResponse> getRequestAccountDeletionMethod;
    if ((getRequestAccountDeletionMethod = PrivacyServiceGrpc.getRequestAccountDeletionMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getRequestAccountDeletionMethod = PrivacyServiceGrpc.getRequestAccountDeletionMethod) == null) {
          PrivacyServiceGrpc.getRequestAccountDeletionMethod = getRequestAccountDeletionMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.RequestAccountDeletionRequest, patches.v1.Privacy.RequestAccountDeletionResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RequestAccountDeletion"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.RequestAccountDeletionRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.RequestAccountDeletionResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("RequestAccountDeletion"))
              .build();
        }
      }
    }
    return getRequestAccountDeletionMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.CancelAccountDeletionRequest,
      patches.v1.Privacy.CancelAccountDeletionResponse> getCancelAccountDeletionMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CancelAccountDeletion",
      requestType = patches.v1.Privacy.CancelAccountDeletionRequest.class,
      responseType = patches.v1.Privacy.CancelAccountDeletionResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.CancelAccountDeletionRequest,
      patches.v1.Privacy.CancelAccountDeletionResponse> getCancelAccountDeletionMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.CancelAccountDeletionRequest, patches.v1.Privacy.CancelAccountDeletionResponse> getCancelAccountDeletionMethod;
    if ((getCancelAccountDeletionMethod = PrivacyServiceGrpc.getCancelAccountDeletionMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getCancelAccountDeletionMethod = PrivacyServiceGrpc.getCancelAccountDeletionMethod) == null) {
          PrivacyServiceGrpc.getCancelAccountDeletionMethod = getCancelAccountDeletionMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.CancelAccountDeletionRequest, patches.v1.Privacy.CancelAccountDeletionResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CancelAccountDeletion"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.CancelAccountDeletionRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.CancelAccountDeletionResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("CancelAccountDeletion"))
              .build();
        }
      }
    }
    return getCancelAccountDeletionMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Privacy.GetDeletionStatusRequest,
      patches.v1.Privacy.GetDeletionStatusResponse> getGetDeletionStatusMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetDeletionStatus",
      requestType = patches.v1.Privacy.GetDeletionStatusRequest.class,
      responseType = patches.v1.Privacy.GetDeletionStatusResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Privacy.GetDeletionStatusRequest,
      patches.v1.Privacy.GetDeletionStatusResponse> getGetDeletionStatusMethod() {
    io.grpc.MethodDescriptor<patches.v1.Privacy.GetDeletionStatusRequest, patches.v1.Privacy.GetDeletionStatusResponse> getGetDeletionStatusMethod;
    if ((getGetDeletionStatusMethod = PrivacyServiceGrpc.getGetDeletionStatusMethod) == null) {
      synchronized (PrivacyServiceGrpc.class) {
        if ((getGetDeletionStatusMethod = PrivacyServiceGrpc.getGetDeletionStatusMethod) == null) {
          PrivacyServiceGrpc.getGetDeletionStatusMethod = getGetDeletionStatusMethod =
              io.grpc.MethodDescriptor.<patches.v1.Privacy.GetDeletionStatusRequest, patches.v1.Privacy.GetDeletionStatusResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetDeletionStatus"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.GetDeletionStatusRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Privacy.GetDeletionStatusResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PrivacyServiceMethodDescriptorSupplier("GetDeletionStatus"))
              .build();
        }
      }
    }
    return getGetDeletionStatusMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static PrivacyServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceStub>() {
        @java.lang.Override
        public PrivacyServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PrivacyServiceStub(channel, callOptions);
        }
      };
    return PrivacyServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static PrivacyServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceBlockingV2Stub>() {
        @java.lang.Override
        public PrivacyServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PrivacyServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return PrivacyServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static PrivacyServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceBlockingStub>() {
        @java.lang.Override
        public PrivacyServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PrivacyServiceBlockingStub(channel, callOptions);
        }
      };
    return PrivacyServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static PrivacyServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PrivacyServiceFutureStub>() {
        @java.lang.Override
        public PrivacyServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PrivacyServiceFutureStub(channel, callOptions);
        }
      };
    return PrivacyServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
   * preferences, account data export, and account deletion with a grace period. None of these
   * functions is ever gated on a paid capability (§174, §184.3, §208).
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Records that the notice text at `notice_version` was shown to the caller. This is a
     * record that the text was shown — never a waiver of anything beyond what the text
     * describes, and it MUST NOT gate any safety, moderation, export, or deletion function
     * (spec §197.1).
     * </pre>
     */
    default void acknowledgePrivacyNotice(patches.v1.Privacy.AcknowledgePrivacyNoticeRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.AcknowledgePrivacyNoticeResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAcknowledgePrivacyNoticeMethod(), responseObserver);
    }

    /**
     */
    default void getPrivacyPrefs(patches.v1.Privacy.GetPrivacyPrefsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.GetPrivacyPrefsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetPrivacyPrefsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Field-mask partial update, same pattern as `ActorService.UpdateProfile` (spec §203).
     * </pre>
     */
    default void updatePrivacyPrefs(patches.v1.Privacy.UpdatePrivacyPrefsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.UpdatePrivacyPrefsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdatePrivacyPrefsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Enqueues a background export job (spec §30, ADR 0004) — never synchronous, and never
     * streams the archive through this process (spec §197.3).
     * </pre>
     */
    default void exportAccount(patches.v1.Privacy.ExportAccountRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.ExportAccountResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getExportAccountMethod(), responseObserver);
    }

    /**
     */
    default void getExportStatus(patches.v1.Privacy.GetExportStatusRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.GetExportStatusResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetExportStatusMethod(), responseObserver);
    }

    /**
     * <pre>
     * Moves the account to `PENDING_DELETION`: it disappears from feeds, search, and the local
     * timeline immediately, and a grace period follows (spec §197.4).
     * </pre>
     */
    default void requestAccountDeletion(patches.v1.Privacy.RequestAccountDeletionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.RequestAccountDeletionResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRequestAccountDeletionMethod(), responseObserver);
    }

    /**
     * <pre>
     * Restores the account intact — only while still within the grace period.
     * </pre>
     */
    default void cancelAccountDeletion(patches.v1.Privacy.CancelAccountDeletionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.CancelAccountDeletionResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCancelAccountDeletionMethod(), responseObserver);
    }

    /**
     */
    default void getDeletionStatus(patches.v1.Privacy.GetDeletionStatusRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.GetDeletionStatusResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetDeletionStatusMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service PrivacyService.
   * <pre>
   * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
   * preferences, account data export, and account deletion with a grace period. None of these
   * functions is ever gated on a paid capability (§174, §184.3, §208).
   * </pre>
   */
  public static abstract class PrivacyServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return PrivacyServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service PrivacyService.
   * <pre>
   * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
   * preferences, account data export, and account deletion with a grace period. None of these
   * functions is ever gated on a paid capability (§174, §184.3, §208).
   * </pre>
   */
  public static final class PrivacyServiceStub
      extends io.grpc.stub.AbstractAsyncStub<PrivacyServiceStub> {
    private PrivacyServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PrivacyServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PrivacyServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Records that the notice text at `notice_version` was shown to the caller. This is a
     * record that the text was shown — never a waiver of anything beyond what the text
     * describes, and it MUST NOT gate any safety, moderation, export, or deletion function
     * (spec §197.1).
     * </pre>
     */
    public void acknowledgePrivacyNotice(patches.v1.Privacy.AcknowledgePrivacyNoticeRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.AcknowledgePrivacyNoticeResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAcknowledgePrivacyNoticeMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getPrivacyPrefs(patches.v1.Privacy.GetPrivacyPrefsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.GetPrivacyPrefsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetPrivacyPrefsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Field-mask partial update, same pattern as `ActorService.UpdateProfile` (spec §203).
     * </pre>
     */
    public void updatePrivacyPrefs(patches.v1.Privacy.UpdatePrivacyPrefsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.UpdatePrivacyPrefsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdatePrivacyPrefsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Enqueues a background export job (spec §30, ADR 0004) — never synchronous, and never
     * streams the archive through this process (spec §197.3).
     * </pre>
     */
    public void exportAccount(patches.v1.Privacy.ExportAccountRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.ExportAccountResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getExportAccountMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getExportStatus(patches.v1.Privacy.GetExportStatusRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.GetExportStatusResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetExportStatusMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Moves the account to `PENDING_DELETION`: it disappears from feeds, search, and the local
     * timeline immediately, and a grace period follows (spec §197.4).
     * </pre>
     */
    public void requestAccountDeletion(patches.v1.Privacy.RequestAccountDeletionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.RequestAccountDeletionResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRequestAccountDeletionMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Restores the account intact — only while still within the grace period.
     * </pre>
     */
    public void cancelAccountDeletion(patches.v1.Privacy.CancelAccountDeletionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.CancelAccountDeletionResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCancelAccountDeletionMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getDeletionStatus(patches.v1.Privacy.GetDeletionStatusRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Privacy.GetDeletionStatusResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetDeletionStatusMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service PrivacyService.
   * <pre>
   * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
   * preferences, account data export, and account deletion with a grace period. None of these
   * functions is ever gated on a paid capability (§174, §184.3, §208).
   * </pre>
   */
  public static final class PrivacyServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<PrivacyServiceBlockingV2Stub> {
    private PrivacyServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PrivacyServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PrivacyServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Records that the notice text at `notice_version` was shown to the caller. This is a
     * record that the text was shown — never a waiver of anything beyond what the text
     * describes, and it MUST NOT gate any safety, moderation, export, or deletion function
     * (spec §197.1).
     * </pre>
     */
    public patches.v1.Privacy.AcknowledgePrivacyNoticeResponse acknowledgePrivacyNotice(patches.v1.Privacy.AcknowledgePrivacyNoticeRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAcknowledgePrivacyNoticeMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Privacy.GetPrivacyPrefsResponse getPrivacyPrefs(patches.v1.Privacy.GetPrivacyPrefsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPrivacyPrefsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Field-mask partial update, same pattern as `ActorService.UpdateProfile` (spec §203).
     * </pre>
     */
    public patches.v1.Privacy.UpdatePrivacyPrefsResponse updatePrivacyPrefs(patches.v1.Privacy.UpdatePrivacyPrefsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdatePrivacyPrefsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Enqueues a background export job (spec §30, ADR 0004) — never synchronous, and never
     * streams the archive through this process (spec §197.3).
     * </pre>
     */
    public patches.v1.Privacy.ExportAccountResponse exportAccount(patches.v1.Privacy.ExportAccountRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getExportAccountMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Privacy.GetExportStatusResponse getExportStatus(patches.v1.Privacy.GetExportStatusRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetExportStatusMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Moves the account to `PENDING_DELETION`: it disappears from feeds, search, and the local
     * timeline immediately, and a grace period follows (spec §197.4).
     * </pre>
     */
    public patches.v1.Privacy.RequestAccountDeletionResponse requestAccountDeletion(patches.v1.Privacy.RequestAccountDeletionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRequestAccountDeletionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Restores the account intact — only while still within the grace period.
     * </pre>
     */
    public patches.v1.Privacy.CancelAccountDeletionResponse cancelAccountDeletion(patches.v1.Privacy.CancelAccountDeletionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCancelAccountDeletionMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Privacy.GetDeletionStatusResponse getDeletionStatus(patches.v1.Privacy.GetDeletionStatusRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetDeletionStatusMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service PrivacyService.
   * <pre>
   * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
   * preferences, account data export, and account deletion with a grace period. None of these
   * functions is ever gated on a paid capability (§174, §184.3, §208).
   * </pre>
   */
  public static final class PrivacyServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<PrivacyServiceBlockingStub> {
    private PrivacyServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PrivacyServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PrivacyServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Records that the notice text at `notice_version` was shown to the caller. This is a
     * record that the text was shown — never a waiver of anything beyond what the text
     * describes, and it MUST NOT gate any safety, moderation, export, or deletion function
     * (spec §197.1).
     * </pre>
     */
    public patches.v1.Privacy.AcknowledgePrivacyNoticeResponse acknowledgePrivacyNotice(patches.v1.Privacy.AcknowledgePrivacyNoticeRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAcknowledgePrivacyNoticeMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Privacy.GetPrivacyPrefsResponse getPrivacyPrefs(patches.v1.Privacy.GetPrivacyPrefsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPrivacyPrefsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Field-mask partial update, same pattern as `ActorService.UpdateProfile` (spec §203).
     * </pre>
     */
    public patches.v1.Privacy.UpdatePrivacyPrefsResponse updatePrivacyPrefs(patches.v1.Privacy.UpdatePrivacyPrefsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdatePrivacyPrefsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Enqueues a background export job (spec §30, ADR 0004) — never synchronous, and never
     * streams the archive through this process (spec §197.3).
     * </pre>
     */
    public patches.v1.Privacy.ExportAccountResponse exportAccount(patches.v1.Privacy.ExportAccountRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getExportAccountMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Privacy.GetExportStatusResponse getExportStatus(patches.v1.Privacy.GetExportStatusRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetExportStatusMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Moves the account to `PENDING_DELETION`: it disappears from feeds, search, and the local
     * timeline immediately, and a grace period follows (spec §197.4).
     * </pre>
     */
    public patches.v1.Privacy.RequestAccountDeletionResponse requestAccountDeletion(patches.v1.Privacy.RequestAccountDeletionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRequestAccountDeletionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Restores the account intact — only while still within the grace period.
     * </pre>
     */
    public patches.v1.Privacy.CancelAccountDeletionResponse cancelAccountDeletion(patches.v1.Privacy.CancelAccountDeletionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCancelAccountDeletionMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Privacy.GetDeletionStatusResponse getDeletionStatus(patches.v1.Privacy.GetDeletionStatusRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetDeletionStatusMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service PrivacyService.
   * <pre>
   * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
   * preferences, account data export, and account deletion with a grace period. None of these
   * functions is ever gated on a paid capability (§174, §184.3, §208).
   * </pre>
   */
  public static final class PrivacyServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<PrivacyServiceFutureStub> {
    private PrivacyServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PrivacyServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PrivacyServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Records that the notice text at `notice_version` was shown to the caller. This is a
     * record that the text was shown — never a waiver of anything beyond what the text
     * describes, and it MUST NOT gate any safety, moderation, export, or deletion function
     * (spec §197.1).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.AcknowledgePrivacyNoticeResponse> acknowledgePrivacyNotice(
        patches.v1.Privacy.AcknowledgePrivacyNoticeRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAcknowledgePrivacyNoticeMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.GetPrivacyPrefsResponse> getPrivacyPrefs(
        patches.v1.Privacy.GetPrivacyPrefsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetPrivacyPrefsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Field-mask partial update, same pattern as `ActorService.UpdateProfile` (spec §203).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.UpdatePrivacyPrefsResponse> updatePrivacyPrefs(
        patches.v1.Privacy.UpdatePrivacyPrefsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdatePrivacyPrefsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Enqueues a background export job (spec §30, ADR 0004) — never synchronous, and never
     * streams the archive through this process (spec §197.3).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.ExportAccountResponse> exportAccount(
        patches.v1.Privacy.ExportAccountRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getExportAccountMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.GetExportStatusResponse> getExportStatus(
        patches.v1.Privacy.GetExportStatusRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetExportStatusMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Moves the account to `PENDING_DELETION`: it disappears from feeds, search, and the local
     * timeline immediately, and a grace period follows (spec §197.4).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.RequestAccountDeletionResponse> requestAccountDeletion(
        patches.v1.Privacy.RequestAccountDeletionRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRequestAccountDeletionMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Restores the account intact — only while still within the grace period.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.CancelAccountDeletionResponse> cancelAccountDeletion(
        patches.v1.Privacy.CancelAccountDeletionRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCancelAccountDeletionMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Privacy.GetDeletionStatusResponse> getDeletionStatus(
        patches.v1.Privacy.GetDeletionStatusRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetDeletionStatusMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_ACKNOWLEDGE_PRIVACY_NOTICE = 0;
  private static final int METHODID_GET_PRIVACY_PREFS = 1;
  private static final int METHODID_UPDATE_PRIVACY_PREFS = 2;
  private static final int METHODID_EXPORT_ACCOUNT = 3;
  private static final int METHODID_GET_EXPORT_STATUS = 4;
  private static final int METHODID_REQUEST_ACCOUNT_DELETION = 5;
  private static final int METHODID_CANCEL_ACCOUNT_DELETION = 6;
  private static final int METHODID_GET_DELETION_STATUS = 7;

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
        case METHODID_ACKNOWLEDGE_PRIVACY_NOTICE:
          serviceImpl.acknowledgePrivacyNotice((patches.v1.Privacy.AcknowledgePrivacyNoticeRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.AcknowledgePrivacyNoticeResponse>) responseObserver);
          break;
        case METHODID_GET_PRIVACY_PREFS:
          serviceImpl.getPrivacyPrefs((patches.v1.Privacy.GetPrivacyPrefsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.GetPrivacyPrefsResponse>) responseObserver);
          break;
        case METHODID_UPDATE_PRIVACY_PREFS:
          serviceImpl.updatePrivacyPrefs((patches.v1.Privacy.UpdatePrivacyPrefsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.UpdatePrivacyPrefsResponse>) responseObserver);
          break;
        case METHODID_EXPORT_ACCOUNT:
          serviceImpl.exportAccount((patches.v1.Privacy.ExportAccountRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.ExportAccountResponse>) responseObserver);
          break;
        case METHODID_GET_EXPORT_STATUS:
          serviceImpl.getExportStatus((patches.v1.Privacy.GetExportStatusRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.GetExportStatusResponse>) responseObserver);
          break;
        case METHODID_REQUEST_ACCOUNT_DELETION:
          serviceImpl.requestAccountDeletion((patches.v1.Privacy.RequestAccountDeletionRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.RequestAccountDeletionResponse>) responseObserver);
          break;
        case METHODID_CANCEL_ACCOUNT_DELETION:
          serviceImpl.cancelAccountDeletion((patches.v1.Privacy.CancelAccountDeletionRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.CancelAccountDeletionResponse>) responseObserver);
          break;
        case METHODID_GET_DELETION_STATUS:
          serviceImpl.getDeletionStatus((patches.v1.Privacy.GetDeletionStatusRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Privacy.GetDeletionStatusResponse>) responseObserver);
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
          getAcknowledgePrivacyNoticeMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.AcknowledgePrivacyNoticeRequest,
              patches.v1.Privacy.AcknowledgePrivacyNoticeResponse>(
                service, METHODID_ACKNOWLEDGE_PRIVACY_NOTICE)))
        .addMethod(
          getGetPrivacyPrefsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.GetPrivacyPrefsRequest,
              patches.v1.Privacy.GetPrivacyPrefsResponse>(
                service, METHODID_GET_PRIVACY_PREFS)))
        .addMethod(
          getUpdatePrivacyPrefsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.UpdatePrivacyPrefsRequest,
              patches.v1.Privacy.UpdatePrivacyPrefsResponse>(
                service, METHODID_UPDATE_PRIVACY_PREFS)))
        .addMethod(
          getExportAccountMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.ExportAccountRequest,
              patches.v1.Privacy.ExportAccountResponse>(
                service, METHODID_EXPORT_ACCOUNT)))
        .addMethod(
          getGetExportStatusMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.GetExportStatusRequest,
              patches.v1.Privacy.GetExportStatusResponse>(
                service, METHODID_GET_EXPORT_STATUS)))
        .addMethod(
          getRequestAccountDeletionMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.RequestAccountDeletionRequest,
              patches.v1.Privacy.RequestAccountDeletionResponse>(
                service, METHODID_REQUEST_ACCOUNT_DELETION)))
        .addMethod(
          getCancelAccountDeletionMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.CancelAccountDeletionRequest,
              patches.v1.Privacy.CancelAccountDeletionResponse>(
                service, METHODID_CANCEL_ACCOUNT_DELETION)))
        .addMethod(
          getGetDeletionStatusMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Privacy.GetDeletionStatusRequest,
              patches.v1.Privacy.GetDeletionStatusResponse>(
                service, METHODID_GET_DELETION_STATUS)))
        .build();
  }

  private static abstract class PrivacyServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    PrivacyServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Privacy.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("PrivacyService");
    }
  }

  private static final class PrivacyServiceFileDescriptorSupplier
      extends PrivacyServiceBaseDescriptorSupplier {
    PrivacyServiceFileDescriptorSupplier() {}
  }

  private static final class PrivacyServiceMethodDescriptorSupplier
      extends PrivacyServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    PrivacyServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (PrivacyServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new PrivacyServiceFileDescriptorSupplier())
              .addMethod(getAcknowledgePrivacyNoticeMethod())
              .addMethod(getGetPrivacyPrefsMethod())
              .addMethod(getUpdatePrivacyPrefsMethod())
              .addMethod(getExportAccountMethod())
              .addMethod(getGetExportStatusMethod())
              .addMethod(getRequestAccountDeletionMethod())
              .addMethod(getCancelAccountDeletionMethod())
              .addMethod(getGetDeletionStatusMethod())
              .build();
        }
      }
    }
    return result;
  }
}
