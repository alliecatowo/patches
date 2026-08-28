package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Server identity, protocol version negotiation and liveness (spec §83).
 * This is a permanent, unauthenticated service: a client calls GetServerInfo
 * before anything else to learn whether it can talk to this instance at all.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/system.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class SystemServiceGrpc {

  private SystemServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.SystemService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.System.GetServerInfoRequest,
      patches.v1.System.GetServerInfoResponse> getGetServerInfoMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetServerInfo",
      requestType = patches.v1.System.GetServerInfoRequest.class,
      responseType = patches.v1.System.GetServerInfoResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.System.GetServerInfoRequest,
      patches.v1.System.GetServerInfoResponse> getGetServerInfoMethod() {
    io.grpc.MethodDescriptor<patches.v1.System.GetServerInfoRequest, patches.v1.System.GetServerInfoResponse> getGetServerInfoMethod;
    if ((getGetServerInfoMethod = SystemServiceGrpc.getGetServerInfoMethod) == null) {
      synchronized (SystemServiceGrpc.class) {
        if ((getGetServerInfoMethod = SystemServiceGrpc.getGetServerInfoMethod) == null) {
          SystemServiceGrpc.getGetServerInfoMethod = getGetServerInfoMethod =
              io.grpc.MethodDescriptor.<patches.v1.System.GetServerInfoRequest, patches.v1.System.GetServerInfoResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetServerInfo"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.System.GetServerInfoRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.System.GetServerInfoResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SystemServiceMethodDescriptorSupplier("GetServerInfo"))
              .build();
        }
      }
    }
    return getGetServerInfoMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.System.PingRequest,
      patches.v1.System.PingResponse> getPingMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "Ping",
      requestType = patches.v1.System.PingRequest.class,
      responseType = patches.v1.System.PingResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.System.PingRequest,
      patches.v1.System.PingResponse> getPingMethod() {
    io.grpc.MethodDescriptor<patches.v1.System.PingRequest, patches.v1.System.PingResponse> getPingMethod;
    if ((getPingMethod = SystemServiceGrpc.getPingMethod) == null) {
      synchronized (SystemServiceGrpc.class) {
        if ((getPingMethod = SystemServiceGrpc.getPingMethod) == null) {
          SystemServiceGrpc.getPingMethod = getPingMethod =
              io.grpc.MethodDescriptor.<patches.v1.System.PingRequest, patches.v1.System.PingResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "Ping"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.System.PingRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.System.PingResponse.getDefaultInstance()))
              .setSchemaDescriptor(new SystemServiceMethodDescriptorSupplier("Ping"))
              .build();
        }
      }
    }
    return getPingMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static SystemServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SystemServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SystemServiceStub>() {
        @java.lang.Override
        public SystemServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SystemServiceStub(channel, callOptions);
        }
      };
    return SystemServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static SystemServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SystemServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SystemServiceBlockingV2Stub>() {
        @java.lang.Override
        public SystemServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SystemServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return SystemServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static SystemServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SystemServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SystemServiceBlockingStub>() {
        @java.lang.Override
        public SystemServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SystemServiceBlockingStub(channel, callOptions);
        }
      };
    return SystemServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static SystemServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<SystemServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<SystemServiceFutureStub>() {
        @java.lang.Override
        public SystemServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new SystemServiceFutureStub(channel, callOptions);
        }
      };
    return SystemServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Server identity, protocol version negotiation and liveness (spec §83).
   * This is a permanent, unauthenticated service: a client calls GetServerInfo
   * before anything else to learn whether it can talk to this instance at all.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Returns the server build, the wire protocol version it speaks and the
     * oldest client build it still accepts. Never requires authentication.
     * </pre>
     */
    default void getServerInfo(patches.v1.System.GetServerInfoRequest request,
        io.grpc.stub.StreamObserver<patches.v1.System.GetServerInfoResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetServerInfoMethod(), responseObserver);
    }

    /**
     * <pre>
     * Cheap liveness/latency probe. Echoes back the nonce it was given so a
     * client can distinguish a fresh reply from a cached one.
     * </pre>
     */
    default void ping(patches.v1.System.PingRequest request,
        io.grpc.stub.StreamObserver<patches.v1.System.PingResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPingMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service SystemService.
   * <pre>
   * Server identity, protocol version negotiation and liveness (spec §83).
   * This is a permanent, unauthenticated service: a client calls GetServerInfo
   * before anything else to learn whether it can talk to this instance at all.
   * </pre>
   */
  public static abstract class SystemServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return SystemServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service SystemService.
   * <pre>
   * Server identity, protocol version negotiation and liveness (spec §83).
   * This is a permanent, unauthenticated service: a client calls GetServerInfo
   * before anything else to learn whether it can talk to this instance at all.
   * </pre>
   */
  public static final class SystemServiceStub
      extends io.grpc.stub.AbstractAsyncStub<SystemServiceStub> {
    private SystemServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SystemServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SystemServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Returns the server build, the wire protocol version it speaks and the
     * oldest client build it still accepts. Never requires authentication.
     * </pre>
     */
    public void getServerInfo(patches.v1.System.GetServerInfoRequest request,
        io.grpc.stub.StreamObserver<patches.v1.System.GetServerInfoResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetServerInfoMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Cheap liveness/latency probe. Echoes back the nonce it was given so a
     * client can distinguish a fresh reply from a cached one.
     * </pre>
     */
    public void ping(patches.v1.System.PingRequest request,
        io.grpc.stub.StreamObserver<patches.v1.System.PingResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPingMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service SystemService.
   * <pre>
   * Server identity, protocol version negotiation and liveness (spec §83).
   * This is a permanent, unauthenticated service: a client calls GetServerInfo
   * before anything else to learn whether it can talk to this instance at all.
   * </pre>
   */
  public static final class SystemServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<SystemServiceBlockingV2Stub> {
    private SystemServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SystemServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SystemServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Returns the server build, the wire protocol version it speaks and the
     * oldest client build it still accepts. Never requires authentication.
     * </pre>
     */
    public patches.v1.System.GetServerInfoResponse getServerInfo(patches.v1.System.GetServerInfoRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetServerInfoMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cheap liveness/latency probe. Echoes back the nonce it was given so a
     * client can distinguish a fresh reply from a cached one.
     * </pre>
     */
    public patches.v1.System.PingResponse ping(patches.v1.System.PingRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPingMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service SystemService.
   * <pre>
   * Server identity, protocol version negotiation and liveness (spec §83).
   * This is a permanent, unauthenticated service: a client calls GetServerInfo
   * before anything else to learn whether it can talk to this instance at all.
   * </pre>
   */
  public static final class SystemServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<SystemServiceBlockingStub> {
    private SystemServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SystemServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SystemServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Returns the server build, the wire protocol version it speaks and the
     * oldest client build it still accepts. Never requires authentication.
     * </pre>
     */
    public patches.v1.System.GetServerInfoResponse getServerInfo(patches.v1.System.GetServerInfoRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetServerInfoMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Cheap liveness/latency probe. Echoes back the nonce it was given so a
     * client can distinguish a fresh reply from a cached one.
     * </pre>
     */
    public patches.v1.System.PingResponse ping(patches.v1.System.PingRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPingMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service SystemService.
   * <pre>
   * Server identity, protocol version negotiation and liveness (spec §83).
   * This is a permanent, unauthenticated service: a client calls GetServerInfo
   * before anything else to learn whether it can talk to this instance at all.
   * </pre>
   */
  public static final class SystemServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<SystemServiceFutureStub> {
    private SystemServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected SystemServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new SystemServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Returns the server build, the wire protocol version it speaks and the
     * oldest client build it still accepts. Never requires authentication.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.System.GetServerInfoResponse> getServerInfo(
        patches.v1.System.GetServerInfoRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetServerInfoMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Cheap liveness/latency probe. Echoes back the nonce it was given so a
     * client can distinguish a fresh reply from a cached one.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.System.PingResponse> ping(
        patches.v1.System.PingRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPingMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_GET_SERVER_INFO = 0;
  private static final int METHODID_PING = 1;

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
        case METHODID_GET_SERVER_INFO:
          serviceImpl.getServerInfo((patches.v1.System.GetServerInfoRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.System.GetServerInfoResponse>) responseObserver);
          break;
        case METHODID_PING:
          serviceImpl.ping((patches.v1.System.PingRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.System.PingResponse>) responseObserver);
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
          getGetServerInfoMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.System.GetServerInfoRequest,
              patches.v1.System.GetServerInfoResponse>(
                service, METHODID_GET_SERVER_INFO)))
        .addMethod(
          getPingMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.System.PingRequest,
              patches.v1.System.PingResponse>(
                service, METHODID_PING)))
        .build();
  }

  private static abstract class SystemServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    SystemServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.System.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("SystemService");
    }
  }

  private static final class SystemServiceFileDescriptorSupplier
      extends SystemServiceBaseDescriptorSupplier {
    SystemServiceFileDescriptorSupplier() {}
  }

  private static final class SystemServiceMethodDescriptorSupplier
      extends SystemServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    SystemServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (SystemServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new SystemServiceFileDescriptorSupplier())
              .addMethod(getGetServerInfoMethod())
              .addMethod(getPingMethod())
              .build();
        }
      }
    }
    return result;
  }
}
