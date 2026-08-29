package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Node discovery (spec §163, §168, §174) — always unauthenticated. A client calls
 * `GetNodeInfo` before assuming any policy (registration mode, limits, capabilities) rather
 * than hardcoding the reference node's behavior.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/node.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class NodeServiceGrpc {

  private NodeServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.NodeService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Node.GetNodeInfoRequest,
      patches.v1.Node.GetNodeInfoResponse> getGetNodeInfoMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetNodeInfo",
      requestType = patches.v1.Node.GetNodeInfoRequest.class,
      responseType = patches.v1.Node.GetNodeInfoResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Node.GetNodeInfoRequest,
      patches.v1.Node.GetNodeInfoResponse> getGetNodeInfoMethod() {
    io.grpc.MethodDescriptor<patches.v1.Node.GetNodeInfoRequest, patches.v1.Node.GetNodeInfoResponse> getGetNodeInfoMethod;
    if ((getGetNodeInfoMethod = NodeServiceGrpc.getGetNodeInfoMethod) == null) {
      synchronized (NodeServiceGrpc.class) {
        if ((getGetNodeInfoMethod = NodeServiceGrpc.getGetNodeInfoMethod) == null) {
          NodeServiceGrpc.getGetNodeInfoMethod = getGetNodeInfoMethod =
              io.grpc.MethodDescriptor.<patches.v1.Node.GetNodeInfoRequest, patches.v1.Node.GetNodeInfoResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetNodeInfo"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Node.GetNodeInfoRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Node.GetNodeInfoResponse.getDefaultInstance()))
              .setSchemaDescriptor(new NodeServiceMethodDescriptorSupplier("GetNodeInfo"))
              .build();
        }
      }
    }
    return getGetNodeInfoMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Node.GetNodePolicyRequest,
      patches.v1.Node.GetNodePolicyResponse> getGetNodePolicyMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetNodePolicy",
      requestType = patches.v1.Node.GetNodePolicyRequest.class,
      responseType = patches.v1.Node.GetNodePolicyResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Node.GetNodePolicyRequest,
      patches.v1.Node.GetNodePolicyResponse> getGetNodePolicyMethod() {
    io.grpc.MethodDescriptor<patches.v1.Node.GetNodePolicyRequest, patches.v1.Node.GetNodePolicyResponse> getGetNodePolicyMethod;
    if ((getGetNodePolicyMethod = NodeServiceGrpc.getGetNodePolicyMethod) == null) {
      synchronized (NodeServiceGrpc.class) {
        if ((getGetNodePolicyMethod = NodeServiceGrpc.getGetNodePolicyMethod) == null) {
          NodeServiceGrpc.getGetNodePolicyMethod = getGetNodePolicyMethod =
              io.grpc.MethodDescriptor.<patches.v1.Node.GetNodePolicyRequest, patches.v1.Node.GetNodePolicyResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetNodePolicy"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Node.GetNodePolicyRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Node.GetNodePolicyResponse.getDefaultInstance()))
              .setSchemaDescriptor(new NodeServiceMethodDescriptorSupplier("GetNodePolicy"))
              .build();
        }
      }
    }
    return getGetNodePolicyMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static NodeServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NodeServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NodeServiceStub>() {
        @java.lang.Override
        public NodeServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NodeServiceStub(channel, callOptions);
        }
      };
    return NodeServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static NodeServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NodeServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NodeServiceBlockingV2Stub>() {
        @java.lang.Override
        public NodeServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NodeServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return NodeServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static NodeServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NodeServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NodeServiceBlockingStub>() {
        @java.lang.Override
        public NodeServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NodeServiceBlockingStub(channel, callOptions);
        }
      };
    return NodeServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static NodeServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<NodeServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<NodeServiceFutureStub>() {
        @java.lang.Override
        public NodeServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new NodeServiceFutureStub(channel, callOptions);
        }
      };
    return NodeServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Node discovery (spec §163, §168, §174) — always unauthenticated. A client calls
   * `GetNodeInfo` before assuming any policy (registration mode, limits, capabilities) rather
   * than hardcoding the reference node's behavior.
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void getNodeInfo(patches.v1.Node.GetNodeInfoRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Node.GetNodeInfoResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetNodeInfoMethod(), responseObserver);
    }

    /**
     * <pre>
     * Operator transparency (spec §197.6): what this node's operators do with your data and
     * your safety. Deliberately a separate RPC from `GetNodeInfo` — this document is larger,
     * changes rarely, and is cached on a different schedule. A node that publishes nothing
     * here has said so; clients render an empty policy as "this node publishes no policy"
     * rather than hiding the screen.
     * </pre>
     */
    default void getNodePolicy(patches.v1.Node.GetNodePolicyRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Node.GetNodePolicyResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetNodePolicyMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service NodeService.
   * <pre>
   * Node discovery (spec §163, §168, §174) — always unauthenticated. A client calls
   * `GetNodeInfo` before assuming any policy (registration mode, limits, capabilities) rather
   * than hardcoding the reference node's behavior.
   * </pre>
   */
  public static abstract class NodeServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return NodeServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service NodeService.
   * <pre>
   * Node discovery (spec §163, §168, §174) — always unauthenticated. A client calls
   * `GetNodeInfo` before assuming any policy (registration mode, limits, capabilities) rather
   * than hardcoding the reference node's behavior.
   * </pre>
   */
  public static final class NodeServiceStub
      extends io.grpc.stub.AbstractAsyncStub<NodeServiceStub> {
    private NodeServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NodeServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NodeServiceStub(channel, callOptions);
    }

    /**
     */
    public void getNodeInfo(patches.v1.Node.GetNodeInfoRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Node.GetNodeInfoResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetNodeInfoMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Operator transparency (spec §197.6): what this node's operators do with your data and
     * your safety. Deliberately a separate RPC from `GetNodeInfo` — this document is larger,
     * changes rarely, and is cached on a different schedule. A node that publishes nothing
     * here has said so; clients render an empty policy as "this node publishes no policy"
     * rather than hiding the screen.
     * </pre>
     */
    public void getNodePolicy(patches.v1.Node.GetNodePolicyRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Node.GetNodePolicyResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetNodePolicyMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service NodeService.
   * <pre>
   * Node discovery (spec §163, §168, §174) — always unauthenticated. A client calls
   * `GetNodeInfo` before assuming any policy (registration mode, limits, capabilities) rather
   * than hardcoding the reference node's behavior.
   * </pre>
   */
  public static final class NodeServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<NodeServiceBlockingV2Stub> {
    private NodeServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NodeServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NodeServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Node.GetNodeInfoResponse getNodeInfo(patches.v1.Node.GetNodeInfoRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetNodeInfoMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Operator transparency (spec §197.6): what this node's operators do with your data and
     * your safety. Deliberately a separate RPC from `GetNodeInfo` — this document is larger,
     * changes rarely, and is cached on a different schedule. A node that publishes nothing
     * here has said so; clients render an empty policy as "this node publishes no policy"
     * rather than hiding the screen.
     * </pre>
     */
    public patches.v1.Node.GetNodePolicyResponse getNodePolicy(patches.v1.Node.GetNodePolicyRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetNodePolicyMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service NodeService.
   * <pre>
   * Node discovery (spec §163, §168, §174) — always unauthenticated. A client calls
   * `GetNodeInfo` before assuming any policy (registration mode, limits, capabilities) rather
   * than hardcoding the reference node's behavior.
   * </pre>
   */
  public static final class NodeServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<NodeServiceBlockingStub> {
    private NodeServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NodeServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NodeServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Node.GetNodeInfoResponse getNodeInfo(patches.v1.Node.GetNodeInfoRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetNodeInfoMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Operator transparency (spec §197.6): what this node's operators do with your data and
     * your safety. Deliberately a separate RPC from `GetNodeInfo` — this document is larger,
     * changes rarely, and is cached on a different schedule. A node that publishes nothing
     * here has said so; clients render an empty policy as "this node publishes no policy"
     * rather than hiding the screen.
     * </pre>
     */
    public patches.v1.Node.GetNodePolicyResponse getNodePolicy(patches.v1.Node.GetNodePolicyRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetNodePolicyMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service NodeService.
   * <pre>
   * Node discovery (spec §163, §168, §174) — always unauthenticated. A client calls
   * `GetNodeInfo` before assuming any policy (registration mode, limits, capabilities) rather
   * than hardcoding the reference node's behavior.
   * </pre>
   */
  public static final class NodeServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<NodeServiceFutureStub> {
    private NodeServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected NodeServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new NodeServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Node.GetNodeInfoResponse> getNodeInfo(
        patches.v1.Node.GetNodeInfoRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetNodeInfoMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Operator transparency (spec §197.6): what this node's operators do with your data and
     * your safety. Deliberately a separate RPC from `GetNodeInfo` — this document is larger,
     * changes rarely, and is cached on a different schedule. A node that publishes nothing
     * here has said so; clients render an empty policy as "this node publishes no policy"
     * rather than hiding the screen.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Node.GetNodePolicyResponse> getNodePolicy(
        patches.v1.Node.GetNodePolicyRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetNodePolicyMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_GET_NODE_INFO = 0;
  private static final int METHODID_GET_NODE_POLICY = 1;

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
        case METHODID_GET_NODE_INFO:
          serviceImpl.getNodeInfo((patches.v1.Node.GetNodeInfoRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Node.GetNodeInfoResponse>) responseObserver);
          break;
        case METHODID_GET_NODE_POLICY:
          serviceImpl.getNodePolicy((patches.v1.Node.GetNodePolicyRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Node.GetNodePolicyResponse>) responseObserver);
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
          getGetNodeInfoMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Node.GetNodeInfoRequest,
              patches.v1.Node.GetNodeInfoResponse>(
                service, METHODID_GET_NODE_INFO)))
        .addMethod(
          getGetNodePolicyMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Node.GetNodePolicyRequest,
              patches.v1.Node.GetNodePolicyResponse>(
                service, METHODID_GET_NODE_POLICY)))
        .build();
  }

  private static abstract class NodeServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    NodeServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Node.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("NodeService");
    }
  }

  private static final class NodeServiceFileDescriptorSupplier
      extends NodeServiceBaseDescriptorSupplier {
    NodeServiceFileDescriptorSupplier() {}
  }

  private static final class NodeServiceMethodDescriptorSupplier
      extends NodeServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    NodeServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (NodeServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new NodeServiceFileDescriptorSupplier())
              .addMethod(getGetNodeInfoMethod())
              .addMethod(getGetNodePolicyMethod())
              .build();
        }
      }
    }
    return result;
  }
}
