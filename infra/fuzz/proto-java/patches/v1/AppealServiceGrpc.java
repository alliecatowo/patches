package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Appeals against a node moderation notice (spec §201.3). Only the acted-upon actor may
 * appeal — not a reporter, not a bystander. One appeal per moderation notice. Admin-side
 * resolution is CLI-only (`patches-admin appeal list|inspect|resolve`) — there is
 * deliberately no gRPC resolve RPC here, mirroring `report list|inspect|resolve`.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/appeals.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class AppealServiceGrpc {

  private AppealServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.AppealService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Appeals.CreateAppealRequest,
      patches.v1.Appeals.CreateAppealResponse> getCreateAppealMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateAppeal",
      requestType = patches.v1.Appeals.CreateAppealRequest.class,
      responseType = patches.v1.Appeals.CreateAppealResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Appeals.CreateAppealRequest,
      patches.v1.Appeals.CreateAppealResponse> getCreateAppealMethod() {
    io.grpc.MethodDescriptor<patches.v1.Appeals.CreateAppealRequest, patches.v1.Appeals.CreateAppealResponse> getCreateAppealMethod;
    if ((getCreateAppealMethod = AppealServiceGrpc.getCreateAppealMethod) == null) {
      synchronized (AppealServiceGrpc.class) {
        if ((getCreateAppealMethod = AppealServiceGrpc.getCreateAppealMethod) == null) {
          AppealServiceGrpc.getCreateAppealMethod = getCreateAppealMethod =
              io.grpc.MethodDescriptor.<patches.v1.Appeals.CreateAppealRequest, patches.v1.Appeals.CreateAppealResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateAppeal"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Appeals.CreateAppealRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Appeals.CreateAppealResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AppealServiceMethodDescriptorSupplier("CreateAppeal"))
              .build();
        }
      }
    }
    return getCreateAppealMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Appeals.GetAppealRequest,
      patches.v1.Appeals.GetAppealResponse> getGetAppealMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetAppeal",
      requestType = patches.v1.Appeals.GetAppealRequest.class,
      responseType = patches.v1.Appeals.GetAppealResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Appeals.GetAppealRequest,
      patches.v1.Appeals.GetAppealResponse> getGetAppealMethod() {
    io.grpc.MethodDescriptor<patches.v1.Appeals.GetAppealRequest, patches.v1.Appeals.GetAppealResponse> getGetAppealMethod;
    if ((getGetAppealMethod = AppealServiceGrpc.getGetAppealMethod) == null) {
      synchronized (AppealServiceGrpc.class) {
        if ((getGetAppealMethod = AppealServiceGrpc.getGetAppealMethod) == null) {
          AppealServiceGrpc.getGetAppealMethod = getGetAppealMethod =
              io.grpc.MethodDescriptor.<patches.v1.Appeals.GetAppealRequest, patches.v1.Appeals.GetAppealResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetAppeal"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Appeals.GetAppealRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Appeals.GetAppealResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AppealServiceMethodDescriptorSupplier("GetAppeal"))
              .build();
        }
      }
    }
    return getGetAppealMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Appeals.ListMyAppealsRequest,
      patches.v1.Appeals.ListMyAppealsResponse> getListMyAppealsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListMyAppeals",
      requestType = patches.v1.Appeals.ListMyAppealsRequest.class,
      responseType = patches.v1.Appeals.ListMyAppealsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Appeals.ListMyAppealsRequest,
      patches.v1.Appeals.ListMyAppealsResponse> getListMyAppealsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Appeals.ListMyAppealsRequest, patches.v1.Appeals.ListMyAppealsResponse> getListMyAppealsMethod;
    if ((getListMyAppealsMethod = AppealServiceGrpc.getListMyAppealsMethod) == null) {
      synchronized (AppealServiceGrpc.class) {
        if ((getListMyAppealsMethod = AppealServiceGrpc.getListMyAppealsMethod) == null) {
          AppealServiceGrpc.getListMyAppealsMethod = getListMyAppealsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Appeals.ListMyAppealsRequest, patches.v1.Appeals.ListMyAppealsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListMyAppeals"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Appeals.ListMyAppealsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Appeals.ListMyAppealsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AppealServiceMethodDescriptorSupplier("ListMyAppeals"))
              .build();
        }
      }
    }
    return getListMyAppealsMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static AppealServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AppealServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AppealServiceStub>() {
        @java.lang.Override
        public AppealServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AppealServiceStub(channel, callOptions);
        }
      };
    return AppealServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static AppealServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AppealServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AppealServiceBlockingV2Stub>() {
        @java.lang.Override
        public AppealServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AppealServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return AppealServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static AppealServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AppealServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AppealServiceBlockingStub>() {
        @java.lang.Override
        public AppealServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AppealServiceBlockingStub(channel, callOptions);
        }
      };
    return AppealServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static AppealServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AppealServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AppealServiceFutureStub>() {
        @java.lang.Override
        public AppealServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AppealServiceFutureStub(channel, callOptions);
        }
      };
    return AppealServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Appeals against a node moderation notice (spec §201.3). Only the acted-upon actor may
   * appeal — not a reporter, not a bystander. One appeal per moderation notice. Admin-side
   * resolution is CLI-only (`patches-admin appeal list|inspect|resolve`) — there is
   * deliberately no gRPC resolve RPC here, mirroring `report list|inspect|resolve`.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * `moderation_notice_id` identifies the notice being appealed
     * (`ModerationService.ListMyModerationNotices`). Rejected if the caller already has an
     * appeal for that notice, or the node's published appeal window has closed
     * (`NodeService.GetNodePolicy`).
     * </pre>
     */
    default void createAppeal(patches.v1.Appeals.CreateAppealRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Appeals.CreateAppealResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateAppealMethod(), responseObserver);
    }

    /**
     */
    default void getAppeal(patches.v1.Appeals.GetAppealRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Appeals.GetAppealResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetAppealMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own appeals, most-recent first.
     * </pre>
     */
    default void listMyAppeals(patches.v1.Appeals.ListMyAppealsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Appeals.ListMyAppealsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListMyAppealsMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service AppealService.
   * <pre>
   * Appeals against a node moderation notice (spec §201.3). Only the acted-upon actor may
   * appeal — not a reporter, not a bystander. One appeal per moderation notice. Admin-side
   * resolution is CLI-only (`patches-admin appeal list|inspect|resolve`) — there is
   * deliberately no gRPC resolve RPC here, mirroring `report list|inspect|resolve`.
   * </pre>
   */
  public static abstract class AppealServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return AppealServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service AppealService.
   * <pre>
   * Appeals against a node moderation notice (spec §201.3). Only the acted-upon actor may
   * appeal — not a reporter, not a bystander. One appeal per moderation notice. Admin-side
   * resolution is CLI-only (`patches-admin appeal list|inspect|resolve`) — there is
   * deliberately no gRPC resolve RPC here, mirroring `report list|inspect|resolve`.
   * </pre>
   */
  public static final class AppealServiceStub
      extends io.grpc.stub.AbstractAsyncStub<AppealServiceStub> {
    private AppealServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AppealServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AppealServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * `moderation_notice_id` identifies the notice being appealed
     * (`ModerationService.ListMyModerationNotices`). Rejected if the caller already has an
     * appeal for that notice, or the node's published appeal window has closed
     * (`NodeService.GetNodePolicy`).
     * </pre>
     */
    public void createAppeal(patches.v1.Appeals.CreateAppealRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Appeals.CreateAppealResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateAppealMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getAppeal(patches.v1.Appeals.GetAppealRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Appeals.GetAppealResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetAppealMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own appeals, most-recent first.
     * </pre>
     */
    public void listMyAppeals(patches.v1.Appeals.ListMyAppealsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Appeals.ListMyAppealsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListMyAppealsMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service AppealService.
   * <pre>
   * Appeals against a node moderation notice (spec §201.3). Only the acted-upon actor may
   * appeal — not a reporter, not a bystander. One appeal per moderation notice. Admin-side
   * resolution is CLI-only (`patches-admin appeal list|inspect|resolve`) — there is
   * deliberately no gRPC resolve RPC here, mirroring `report list|inspect|resolve`.
   * </pre>
   */
  public static final class AppealServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<AppealServiceBlockingV2Stub> {
    private AppealServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AppealServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AppealServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * `moderation_notice_id` identifies the notice being appealed
     * (`ModerationService.ListMyModerationNotices`). Rejected if the caller already has an
     * appeal for that notice, or the node's published appeal window has closed
     * (`NodeService.GetNodePolicy`).
     * </pre>
     */
    public patches.v1.Appeals.CreateAppealResponse createAppeal(patches.v1.Appeals.CreateAppealRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateAppealMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Appeals.GetAppealResponse getAppeal(patches.v1.Appeals.GetAppealRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetAppealMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own appeals, most-recent first.
     * </pre>
     */
    public patches.v1.Appeals.ListMyAppealsResponse listMyAppeals(patches.v1.Appeals.ListMyAppealsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMyAppealsMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service AppealService.
   * <pre>
   * Appeals against a node moderation notice (spec §201.3). Only the acted-upon actor may
   * appeal — not a reporter, not a bystander. One appeal per moderation notice. Admin-side
   * resolution is CLI-only (`patches-admin appeal list|inspect|resolve`) — there is
   * deliberately no gRPC resolve RPC here, mirroring `report list|inspect|resolve`.
   * </pre>
   */
  public static final class AppealServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<AppealServiceBlockingStub> {
    private AppealServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AppealServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AppealServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * `moderation_notice_id` identifies the notice being appealed
     * (`ModerationService.ListMyModerationNotices`). Rejected if the caller already has an
     * appeal for that notice, or the node's published appeal window has closed
     * (`NodeService.GetNodePolicy`).
     * </pre>
     */
    public patches.v1.Appeals.CreateAppealResponse createAppeal(patches.v1.Appeals.CreateAppealRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateAppealMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Appeals.GetAppealResponse getAppeal(patches.v1.Appeals.GetAppealRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetAppealMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own appeals, most-recent first.
     * </pre>
     */
    public patches.v1.Appeals.ListMyAppealsResponse listMyAppeals(patches.v1.Appeals.ListMyAppealsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMyAppealsMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service AppealService.
   * <pre>
   * Appeals against a node moderation notice (spec §201.3). Only the acted-upon actor may
   * appeal — not a reporter, not a bystander. One appeal per moderation notice. Admin-side
   * resolution is CLI-only (`patches-admin appeal list|inspect|resolve`) — there is
   * deliberately no gRPC resolve RPC here, mirroring `report list|inspect|resolve`.
   * </pre>
   */
  public static final class AppealServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<AppealServiceFutureStub> {
    private AppealServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AppealServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AppealServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * `moderation_notice_id` identifies the notice being appealed
     * (`ModerationService.ListMyModerationNotices`). Rejected if the caller already has an
     * appeal for that notice, or the node's published appeal window has closed
     * (`NodeService.GetNodePolicy`).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Appeals.CreateAppealResponse> createAppeal(
        patches.v1.Appeals.CreateAppealRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateAppealMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Appeals.GetAppealResponse> getAppeal(
        patches.v1.Appeals.GetAppealRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetAppealMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own appeals, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Appeals.ListMyAppealsResponse> listMyAppeals(
        patches.v1.Appeals.ListMyAppealsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListMyAppealsMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_CREATE_APPEAL = 0;
  private static final int METHODID_GET_APPEAL = 1;
  private static final int METHODID_LIST_MY_APPEALS = 2;

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
        case METHODID_CREATE_APPEAL:
          serviceImpl.createAppeal((patches.v1.Appeals.CreateAppealRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Appeals.CreateAppealResponse>) responseObserver);
          break;
        case METHODID_GET_APPEAL:
          serviceImpl.getAppeal((patches.v1.Appeals.GetAppealRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Appeals.GetAppealResponse>) responseObserver);
          break;
        case METHODID_LIST_MY_APPEALS:
          serviceImpl.listMyAppeals((patches.v1.Appeals.ListMyAppealsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Appeals.ListMyAppealsResponse>) responseObserver);
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
          getCreateAppealMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Appeals.CreateAppealRequest,
              patches.v1.Appeals.CreateAppealResponse>(
                service, METHODID_CREATE_APPEAL)))
        .addMethod(
          getGetAppealMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Appeals.GetAppealRequest,
              patches.v1.Appeals.GetAppealResponse>(
                service, METHODID_GET_APPEAL)))
        .addMethod(
          getListMyAppealsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Appeals.ListMyAppealsRequest,
              patches.v1.Appeals.ListMyAppealsResponse>(
                service, METHODID_LIST_MY_APPEALS)))
        .build();
  }

  private static abstract class AppealServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    AppealServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Appeals.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("AppealService");
    }
  }

  private static final class AppealServiceFileDescriptorSupplier
      extends AppealServiceBaseDescriptorSupplier {
    AppealServiceFileDescriptorSupplier() {}
  }

  private static final class AppealServiceMethodDescriptorSupplier
      extends AppealServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    AppealServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (AppealServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new AppealServiceFileDescriptorSupplier())
              .addMethod(getCreateAppealMethod())
              .addMethod(getGetAppealMethod())
              .addMethod(getListMyAppealsMethod())
              .build();
        }
      }
    }
    return result;
  }
}
