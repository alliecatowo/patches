package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Notification rows (spec §56, §113) — no separate event service. The TUI polls
 * `GetUnreadCount`/`ListNotifications` when active; there is no push infrastructure in v0.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/notifications.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class NotificationServiceGrpc {

  private NotificationServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.NotificationService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Notifications.ListNotificationsRequest,
      patches.v1.Notifications.ListNotificationsResponse> getListNotificationsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListNotifications",
      requestType = patches.v1.Notifications.ListNotificationsRequest.class,
      responseType = patches.v1.Notifications.ListNotificationsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Notifications.ListNotificationsRequest,
      patches.v1.Notifications.ListNotificationsResponse> getListNotificationsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Notifications.ListNotificationsRequest, patches.v1.Notifications.ListNotificationsResponse> getListNotificationsMethod;
    if ((getListNotificationsMethod = NotificationServiceGrpc.getListNotificationsMethod) == null) {
      synchronized (NotificationServiceGrpc.class) {
        if ((getListNotificationsMethod = NotificationServiceGrpc.getListNotificationsMethod) == null) {
          NotificationServiceGrpc.getListNotificationsMethod = getListNotificationsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Notifications.ListNotificationsRequest, patches.v1.Notifications.ListNotificationsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListNotifications"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Notifications.ListNotificationsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Notifications.ListNotificationsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new NotificationServiceMethodDescriptorSupplier("ListNotifications"))
              .build();
        }
      }
    }
    return getListNotificationsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Notifications.MarkNotificationsReadRequest,
      patches.v1.Notifications.MarkNotificationsReadResponse> getMarkNotificationsReadMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "MarkNotificationsRead",
      requestType = patches.v1.Notifications.MarkNotificationsReadRequest.class,
      responseType = patches.v1.Notifications.MarkNotificationsReadResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Notifications.MarkNotificationsReadRequest,
      patches.v1.Notifications.MarkNotificationsReadResponse> getMarkNotificationsReadMethod() {
    io.grpc.MethodDescriptor<patches.v1.Notifications.MarkNotificationsReadRequest, patches.v1.Notifications.MarkNotificationsReadResponse> getMarkNotificationsReadMethod;
    if ((getMarkNotificationsReadMethod = NotificationServiceGrpc.getMarkNotificationsReadMethod) == null) {
      synchronized (NotificationServiceGrpc.class) {
        if ((getMarkNotificationsReadMethod = NotificationServiceGrpc.getMarkNotificationsReadMethod) == null) {
          NotificationServiceGrpc.getMarkNotificationsReadMethod = getMarkNotificationsReadMethod =
              io.grpc.MethodDescriptor.<patches.v1.Notifications.MarkNotificationsReadRequest, patches.v1.Notifications.MarkNotificationsReadResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "MarkNotificationsRead"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Notifications.MarkNotificationsReadRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Notifications.MarkNotificationsReadResponse.getDefaultInstance()))
              .setSchemaDescriptor(new NotificationServiceMethodDescriptorSupplier("MarkNotificationsRead"))
              .build();
        }
      }
    }
    return getMarkNotificationsReadMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Notifications.GetUnreadCountRequest,
      patches.v1.Notifications.GetUnreadCountResponse> getGetUnreadCountMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetUnreadCount",
      requestType = patches.v1.Notifications.GetUnreadCountRequest.class,
      responseType = patches.v1.Notifications.GetUnreadCountResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Notifications.GetUnreadCountRequest,
      patches.v1.Notifications.GetUnreadCountResponse> getGetUnreadCountMethod() {
    io.grpc.MethodDescriptor<patches.v1.Notifications.GetUnreadCountRequest, patches.v1.Notifications.GetUnreadCountResponse> getGetUnreadCountMethod;
    if ((getGetUnreadCountMethod = NotificationServiceGrpc.getGetUnreadCountMethod) == null) {
      synchronized (NotificationServiceGrpc.class) {
        if ((getGetUnreadCountMethod = NotificationServiceGrpc.getGetUnreadCountMethod) == null) {
          NotificationServiceGrpc.getGetUnreadCountMethod = getGetUnreadCountMethod =
              io.grpc.MethodDescriptor.<patches.v1.Notifications.GetUnreadCountRequest, patches.v1.Notifications.GetUnreadCountResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetUnreadCount"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Notifications.GetUnreadCountRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Notifications.GetUnreadCountResponse.getDefaultInstance()))
              .setSchemaDescriptor(new NotificationServiceMethodDescriptorSupplier("GetUnreadCount"))
              .build();
        }
      }
    }
    return getGetUnreadCountMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static NotificationServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NotificationServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NotificationServiceStub>() {
        @java.lang.Override
        public NotificationServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NotificationServiceStub(channel, callOptions);
        }
      };
    return NotificationServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static NotificationServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NotificationServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NotificationServiceBlockingV2Stub>() {
        @java.lang.Override
        public NotificationServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NotificationServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return NotificationServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static NotificationServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NotificationServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NotificationServiceBlockingStub>() {
        @java.lang.Override
        public NotificationServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NotificationServiceBlockingStub(channel, callOptions);
        }
      };
    return NotificationServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static NotificationServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NotificationServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NotificationServiceFutureStub>() {
        @java.lang.Override
        public NotificationServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NotificationServiceFutureStub(channel, callOptions);
        }
      };
    return NotificationServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Notification rows (spec §56, §113) — no separate event service. The TUI polls
   * `GetUnreadCount`/`ListNotifications` when active; there is no push infrastructure in v0.
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void listNotifications(patches.v1.Notifications.ListNotificationsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Notifications.ListNotificationsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListNotificationsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Collapses spec §56's `MarkNotificationRead`/`MarkAllNotificationsRead` into one idempotent
     * RPC: marks every notification at or before `through_id` as read, or every notification
     * when `mark_all` is true. Marking an already-read notification again is not an error.
     * </pre>
     */
    default void markNotificationsRead(patches.v1.Notifications.MarkNotificationsReadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Notifications.MarkNotificationsReadResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getMarkNotificationsReadMethod(), responseObserver);
    }

    /**
     */
    default void getUnreadCount(patches.v1.Notifications.GetUnreadCountRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Notifications.GetUnreadCountResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetUnreadCountMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service NotificationService.
   * <pre>
   * Notification rows (spec §56, §113) — no separate event service. The TUI polls
   * `GetUnreadCount`/`ListNotifications` when active; there is no push infrastructure in v0.
   * </pre>
   */
  public static abstract class NotificationServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return NotificationServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service NotificationService.
   * <pre>
   * Notification rows (spec §56, §113) — no separate event service. The TUI polls
   * `GetUnreadCount`/`ListNotifications` when active; there is no push infrastructure in v0.
   * </pre>
   */
  public static final class NotificationServiceStub
      extends io.grpc.stub.AbstractAsyncStub<NotificationServiceStub> {
    private NotificationServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NotificationServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NotificationServiceStub(channel, callOptions);
    }

    /**
     */
    public void listNotifications(patches.v1.Notifications.ListNotificationsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Notifications.ListNotificationsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListNotificationsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Collapses spec §56's `MarkNotificationRead`/`MarkAllNotificationsRead` into one idempotent
     * RPC: marks every notification at or before `through_id` as read, or every notification
     * when `mark_all` is true. Marking an already-read notification again is not an error.
     * </pre>
     */
    public void markNotificationsRead(patches.v1.Notifications.MarkNotificationsReadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Notifications.MarkNotificationsReadResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getMarkNotificationsReadMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getUnreadCount(patches.v1.Notifications.GetUnreadCountRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Notifications.GetUnreadCountResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetUnreadCountMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service NotificationService.
   * <pre>
   * Notification rows (spec §56, §113) — no separate event service. The TUI polls
   * `GetUnreadCount`/`ListNotifications` when active; there is no push infrastructure in v0.
   * </pre>
   */
  public static final class NotificationServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<NotificationServiceBlockingV2Stub> {
    private NotificationServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NotificationServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NotificationServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Notifications.ListNotificationsResponse listNotifications(patches.v1.Notifications.ListNotificationsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListNotificationsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Collapses spec §56's `MarkNotificationRead`/`MarkAllNotificationsRead` into one idempotent
     * RPC: marks every notification at or before `through_id` as read, or every notification
     * when `mark_all` is true. Marking an already-read notification again is not an error.
     * </pre>
     */
    public patches.v1.Notifications.MarkNotificationsReadResponse markNotificationsRead(patches.v1.Notifications.MarkNotificationsReadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMarkNotificationsReadMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Notifications.GetUnreadCountResponse getUnreadCount(patches.v1.Notifications.GetUnreadCountRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetUnreadCountMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service NotificationService.
   * <pre>
   * Notification rows (spec §56, §113) — no separate event service. The TUI polls
   * `GetUnreadCount`/`ListNotifications` when active; there is no push infrastructure in v0.
   * </pre>
   */
  public static final class NotificationServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<NotificationServiceBlockingStub> {
    private NotificationServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NotificationServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NotificationServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Notifications.ListNotificationsResponse listNotifications(patches.v1.Notifications.ListNotificationsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListNotificationsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Collapses spec §56's `MarkNotificationRead`/`MarkAllNotificationsRead` into one idempotent
     * RPC: marks every notification at or before `through_id` as read, or every notification
     * when `mark_all` is true. Marking an already-read notification again is not an error.
     * </pre>
     */
    public patches.v1.Notifications.MarkNotificationsReadResponse markNotificationsRead(patches.v1.Notifications.MarkNotificationsReadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMarkNotificationsReadMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Notifications.GetUnreadCountResponse getUnreadCount(patches.v1.Notifications.GetUnreadCountRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetUnreadCountMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service NotificationService.
   * <pre>
   * Notification rows (spec §56, §113) — no separate event service. The TUI polls
   * `GetUnreadCount`/`ListNotifications` when active; there is no push infrastructure in v0.
   * </pre>
   */
  public static final class NotificationServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<NotificationServiceFutureStub> {
    private NotificationServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NotificationServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NotificationServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Notifications.ListNotificationsResponse> listNotifications(
        patches.v1.Notifications.ListNotificationsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListNotificationsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Collapses spec §56's `MarkNotificationRead`/`MarkAllNotificationsRead` into one idempotent
     * RPC: marks every notification at or before `through_id` as read, or every notification
     * when `mark_all` is true. Marking an already-read notification again is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Notifications.MarkNotificationsReadResponse> markNotificationsRead(
        patches.v1.Notifications.MarkNotificationsReadRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getMarkNotificationsReadMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Notifications.GetUnreadCountResponse> getUnreadCount(
        patches.v1.Notifications.GetUnreadCountRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetUnreadCountMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_LIST_NOTIFICATIONS = 0;
  private static final int METHODID_MARK_NOTIFICATIONS_READ = 1;
  private static final int METHODID_GET_UNREAD_COUNT = 2;

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
        case METHODID_LIST_NOTIFICATIONS:
          serviceImpl.listNotifications((patches.v1.Notifications.ListNotificationsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Notifications.ListNotificationsResponse>) responseObserver);
          break;
        case METHODID_MARK_NOTIFICATIONS_READ:
          serviceImpl.markNotificationsRead((patches.v1.Notifications.MarkNotificationsReadRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Notifications.MarkNotificationsReadResponse>) responseObserver);
          break;
        case METHODID_GET_UNREAD_COUNT:
          serviceImpl.getUnreadCount((patches.v1.Notifications.GetUnreadCountRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Notifications.GetUnreadCountResponse>) responseObserver);
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
          getListNotificationsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Notifications.ListNotificationsRequest,
              patches.v1.Notifications.ListNotificationsResponse>(
                service, METHODID_LIST_NOTIFICATIONS)))
        .addMethod(
          getMarkNotificationsReadMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Notifications.MarkNotificationsReadRequest,
              patches.v1.Notifications.MarkNotificationsReadResponse>(
                service, METHODID_MARK_NOTIFICATIONS_READ)))
        .addMethod(
          getGetUnreadCountMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Notifications.GetUnreadCountRequest,
              patches.v1.Notifications.GetUnreadCountResponse>(
                service, METHODID_GET_UNREAD_COUNT)))
        .build();
  }

  private static abstract class NotificationServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    NotificationServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Notifications.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("NotificationService");
    }
  }

  private static final class NotificationServiceFileDescriptorSupplier
      extends NotificationServiceBaseDescriptorSupplier {
    NotificationServiceFileDescriptorSupplier() {}
  }

  private static final class NotificationServiceMethodDescriptorSupplier
      extends NotificationServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    NotificationServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (NotificationServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new NotificationServiceFileDescriptorSupplier())
              .addMethod(getListNotificationsMethod())
              .addMethod(getMarkNotificationsReadMethod())
              .addMethod(getGetUnreadCountMethod())
              .build();
        }
      }
    }
    return result;
  }
}
