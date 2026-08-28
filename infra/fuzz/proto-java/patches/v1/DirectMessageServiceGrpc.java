package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * The generic conversation surface (spec §183, §188–190; ADR 0030 §B-095). Every conversation
 * today is `E2EE_V1` (`E2eeService.CreateE2eeConversation` is the only way to create one, and
 * `E2eeService.SendEnvelopes` the only way to add a message to one) — this service only lists,
 * reads, and tracks membership/read-state for conversations, never their content. The plaintext
 * send/read/request RPCs this service used to carry (`SendMessage`, `ListMessages`,
 * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
 * ADR 0030's pre-alpha consolidation policy the same change set E2EE-only conversations shipped
 * in — never federated (ADR 0020 §13).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/messages.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class DirectMessageServiceGrpc {

  private DirectMessageServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.DirectMessageService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Messages.ListConversationsRequest,
      patches.v1.Messages.ListConversationsResponse> getListConversationsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListConversations",
      requestType = patches.v1.Messages.ListConversationsRequest.class,
      responseType = patches.v1.Messages.ListConversationsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Messages.ListConversationsRequest,
      patches.v1.Messages.ListConversationsResponse> getListConversationsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Messages.ListConversationsRequest, patches.v1.Messages.ListConversationsResponse> getListConversationsMethod;
    if ((getListConversationsMethod = DirectMessageServiceGrpc.getListConversationsMethod) == null) {
      synchronized (DirectMessageServiceGrpc.class) {
        if ((getListConversationsMethod = DirectMessageServiceGrpc.getListConversationsMethod) == null) {
          DirectMessageServiceGrpc.getListConversationsMethod = getListConversationsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Messages.ListConversationsRequest, patches.v1.Messages.ListConversationsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListConversations"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.ListConversationsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.ListConversationsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new DirectMessageServiceMethodDescriptorSupplier("ListConversations"))
              .build();
        }
      }
    }
    return getListConversationsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Messages.GetConversationRequest,
      patches.v1.Messages.GetConversationResponse> getGetConversationMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetConversation",
      requestType = patches.v1.Messages.GetConversationRequest.class,
      responseType = patches.v1.Messages.GetConversationResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Messages.GetConversationRequest,
      patches.v1.Messages.GetConversationResponse> getGetConversationMethod() {
    io.grpc.MethodDescriptor<patches.v1.Messages.GetConversationRequest, patches.v1.Messages.GetConversationResponse> getGetConversationMethod;
    if ((getGetConversationMethod = DirectMessageServiceGrpc.getGetConversationMethod) == null) {
      synchronized (DirectMessageServiceGrpc.class) {
        if ((getGetConversationMethod = DirectMessageServiceGrpc.getGetConversationMethod) == null) {
          DirectMessageServiceGrpc.getGetConversationMethod = getGetConversationMethod =
              io.grpc.MethodDescriptor.<patches.v1.Messages.GetConversationRequest, patches.v1.Messages.GetConversationResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetConversation"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.GetConversationRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.GetConversationResponse.getDefaultInstance()))
              .setSchemaDescriptor(new DirectMessageServiceMethodDescriptorSupplier("GetConversation"))
              .build();
        }
      }
    }
    return getGetConversationMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Messages.LeaveConversationRequest,
      patches.v1.Messages.LeaveConversationResponse> getLeaveConversationMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "LeaveConversation",
      requestType = patches.v1.Messages.LeaveConversationRequest.class,
      responseType = patches.v1.Messages.LeaveConversationResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Messages.LeaveConversationRequest,
      patches.v1.Messages.LeaveConversationResponse> getLeaveConversationMethod() {
    io.grpc.MethodDescriptor<patches.v1.Messages.LeaveConversationRequest, patches.v1.Messages.LeaveConversationResponse> getLeaveConversationMethod;
    if ((getLeaveConversationMethod = DirectMessageServiceGrpc.getLeaveConversationMethod) == null) {
      synchronized (DirectMessageServiceGrpc.class) {
        if ((getLeaveConversationMethod = DirectMessageServiceGrpc.getLeaveConversationMethod) == null) {
          DirectMessageServiceGrpc.getLeaveConversationMethod = getLeaveConversationMethod =
              io.grpc.MethodDescriptor.<patches.v1.Messages.LeaveConversationRequest, patches.v1.Messages.LeaveConversationResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "LeaveConversation"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.LeaveConversationRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.LeaveConversationResponse.getDefaultInstance()))
              .setSchemaDescriptor(new DirectMessageServiceMethodDescriptorSupplier("LeaveConversation"))
              .build();
        }
      }
    }
    return getLeaveConversationMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Messages.MarkConversationReadRequest,
      patches.v1.Messages.MarkConversationReadResponse> getMarkConversationReadMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "MarkConversationRead",
      requestType = patches.v1.Messages.MarkConversationReadRequest.class,
      responseType = patches.v1.Messages.MarkConversationReadResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Messages.MarkConversationReadRequest,
      patches.v1.Messages.MarkConversationReadResponse> getMarkConversationReadMethod() {
    io.grpc.MethodDescriptor<patches.v1.Messages.MarkConversationReadRequest, patches.v1.Messages.MarkConversationReadResponse> getMarkConversationReadMethod;
    if ((getMarkConversationReadMethod = DirectMessageServiceGrpc.getMarkConversationReadMethod) == null) {
      synchronized (DirectMessageServiceGrpc.class) {
        if ((getMarkConversationReadMethod = DirectMessageServiceGrpc.getMarkConversationReadMethod) == null) {
          DirectMessageServiceGrpc.getMarkConversationReadMethod = getMarkConversationReadMethod =
              io.grpc.MethodDescriptor.<patches.v1.Messages.MarkConversationReadRequest, patches.v1.Messages.MarkConversationReadResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "MarkConversationRead"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.MarkConversationReadRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Messages.MarkConversationReadResponse.getDefaultInstance()))
              .setSchemaDescriptor(new DirectMessageServiceMethodDescriptorSupplier("MarkConversationRead"))
              .build();
        }
      }
    }
    return getMarkConversationReadMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static DirectMessageServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceStub>() {
        @java.lang.Override
        public DirectMessageServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new DirectMessageServiceStub(channel, callOptions);
        }
      };
    return DirectMessageServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static DirectMessageServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceBlockingV2Stub>() {
        @java.lang.Override
        public DirectMessageServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new DirectMessageServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return DirectMessageServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static DirectMessageServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceBlockingStub>() {
        @java.lang.Override
        public DirectMessageServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new DirectMessageServiceBlockingStub(channel, callOptions);
        }
      };
    return DirectMessageServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static DirectMessageServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<DirectMessageServiceFutureStub>() {
        @java.lang.Override
        public DirectMessageServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new DirectMessageServiceFutureStub(channel, callOptions);
        }
      };
    return DirectMessageServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * The generic conversation surface (spec §183, §188–190; ADR 0030 §B-095). Every conversation
   * today is `E2EE_V1` (`E2eeService.CreateE2eeConversation` is the only way to create one, and
   * `E2eeService.SendEnvelopes` the only way to add a message to one) — this service only lists,
   * reads, and tracks membership/read-state for conversations, never their content. The plaintext
   * send/read/request RPCs this service used to carry (`SendMessage`, `ListMessages`,
   * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
   * ADR 0030's pre-alpha consolidation policy the same change set E2EE-only conversations shipped
   * in — never federated (ADR 0020 §13).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void listConversations(patches.v1.Messages.ListConversationsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.ListConversationsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListConversationsMethod(), responseObserver);
    }

    /**
     */
    default void getConversation(patches.v1.Messages.GetConversationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.GetConversationResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetConversationMethod(), responseObserver);
    }

    /**
     * <pre>
     * Always rejected with `UNIMPLEMENTED` (ADR 0030 §B-095): every conversation is `E2EE_V1`,
     * so leaving is a group-control transition — a silent `left_at` flip would desync the
     * membership epoch and roster chain every other member verifies. Self-removal goes through
     * `E2eeService.RemoveE2eeMember` with `actor_id` set to the caller.
     * </pre>
     */
    default void leaveConversation(patches.v1.Messages.LeaveConversationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.LeaveConversationResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getLeaveConversationMethod(), responseObserver);
    }

    /**
     */
    default void markConversationRead(patches.v1.Messages.MarkConversationReadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.MarkConversationReadResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getMarkConversationReadMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service DirectMessageService.
   * <pre>
   * The generic conversation surface (spec §183, §188–190; ADR 0030 §B-095). Every conversation
   * today is `E2EE_V1` (`E2eeService.CreateE2eeConversation` is the only way to create one, and
   * `E2eeService.SendEnvelopes` the only way to add a message to one) — this service only lists,
   * reads, and tracks membership/read-state for conversations, never their content. The plaintext
   * send/read/request RPCs this service used to carry (`SendMessage`, `ListMessages`,
   * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
   * ADR 0030's pre-alpha consolidation policy the same change set E2EE-only conversations shipped
   * in — never federated (ADR 0020 §13).
   * </pre>
   */
  public static abstract class DirectMessageServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return DirectMessageServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service DirectMessageService.
   * <pre>
   * The generic conversation surface (spec §183, §188–190; ADR 0030 §B-095). Every conversation
   * today is `E2EE_V1` (`E2eeService.CreateE2eeConversation` is the only way to create one, and
   * `E2eeService.SendEnvelopes` the only way to add a message to one) — this service only lists,
   * reads, and tracks membership/read-state for conversations, never their content. The plaintext
   * send/read/request RPCs this service used to carry (`SendMessage`, `ListMessages`,
   * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
   * ADR 0030's pre-alpha consolidation policy the same change set E2EE-only conversations shipped
   * in — never federated (ADR 0020 §13).
   * </pre>
   */
  public static final class DirectMessageServiceStub
      extends io.grpc.stub.AbstractAsyncStub<DirectMessageServiceStub> {
    private DirectMessageServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected DirectMessageServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new DirectMessageServiceStub(channel, callOptions);
    }

    /**
     */
    public void listConversations(patches.v1.Messages.ListConversationsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.ListConversationsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListConversationsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getConversation(patches.v1.Messages.GetConversationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.GetConversationResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetConversationMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Always rejected with `UNIMPLEMENTED` (ADR 0030 §B-095): every conversation is `E2EE_V1`,
     * so leaving is a group-control transition — a silent `left_at` flip would desync the
     * membership epoch and roster chain every other member verifies. Self-removal goes through
     * `E2eeService.RemoveE2eeMember` with `actor_id` set to the caller.
     * </pre>
     */
    public void leaveConversation(patches.v1.Messages.LeaveConversationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.LeaveConversationResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getLeaveConversationMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void markConversationRead(patches.v1.Messages.MarkConversationReadRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Messages.MarkConversationReadResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getMarkConversationReadMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service DirectMessageService.
   * <pre>
   * The generic conversation surface (spec §183, §188–190; ADR 0030 §B-095). Every conversation
   * today is `E2EE_V1` (`E2eeService.CreateE2eeConversation` is the only way to create one, and
   * `E2eeService.SendEnvelopes` the only way to add a message to one) — this service only lists,
   * reads, and tracks membership/read-state for conversations, never their content. The plaintext
   * send/read/request RPCs this service used to carry (`SendMessage`, `ListMessages`,
   * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
   * ADR 0030's pre-alpha consolidation policy the same change set E2EE-only conversations shipped
   * in — never federated (ADR 0020 §13).
   * </pre>
   */
  public static final class DirectMessageServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<DirectMessageServiceBlockingV2Stub> {
    private DirectMessageServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected DirectMessageServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new DirectMessageServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Messages.ListConversationsResponse listConversations(patches.v1.Messages.ListConversationsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListConversationsMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Messages.GetConversationResponse getConversation(patches.v1.Messages.GetConversationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetConversationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Always rejected with `UNIMPLEMENTED` (ADR 0030 §B-095): every conversation is `E2EE_V1`,
     * so leaving is a group-control transition — a silent `left_at` flip would desync the
     * membership epoch and roster chain every other member verifies. Self-removal goes through
     * `E2eeService.RemoveE2eeMember` with `actor_id` set to the caller.
     * </pre>
     */
    public patches.v1.Messages.LeaveConversationResponse leaveConversation(patches.v1.Messages.LeaveConversationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLeaveConversationMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Messages.MarkConversationReadResponse markConversationRead(patches.v1.Messages.MarkConversationReadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMarkConversationReadMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service DirectMessageService.
   * <pre>
   * The generic conversation surface (spec §183, §188–190; ADR 0030 §B-095). Every conversation
   * today is `E2EE_V1` (`E2eeService.CreateE2eeConversation` is the only way to create one, and
   * `E2eeService.SendEnvelopes` the only way to add a message to one) — this service only lists,
   * reads, and tracks membership/read-state for conversations, never their content. The plaintext
   * send/read/request RPCs this service used to carry (`SendMessage`, `ListMessages`,
   * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
   * ADR 0030's pre-alpha consolidation policy the same change set E2EE-only conversations shipped
   * in — never federated (ADR 0020 §13).
   * </pre>
   */
  public static final class DirectMessageServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<DirectMessageServiceBlockingStub> {
    private DirectMessageServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected DirectMessageServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new DirectMessageServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Messages.ListConversationsResponse listConversations(patches.v1.Messages.ListConversationsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListConversationsMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Messages.GetConversationResponse getConversation(patches.v1.Messages.GetConversationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetConversationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Always rejected with `UNIMPLEMENTED` (ADR 0030 §B-095): every conversation is `E2EE_V1`,
     * so leaving is a group-control transition — a silent `left_at` flip would desync the
     * membership epoch and roster chain every other member verifies. Self-removal goes through
     * `E2eeService.RemoveE2eeMember` with `actor_id` set to the caller.
     * </pre>
     */
    public patches.v1.Messages.LeaveConversationResponse leaveConversation(patches.v1.Messages.LeaveConversationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLeaveConversationMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Messages.MarkConversationReadResponse markConversationRead(patches.v1.Messages.MarkConversationReadRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMarkConversationReadMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service DirectMessageService.
   * <pre>
   * The generic conversation surface (spec §183, §188–190; ADR 0030 §B-095). Every conversation
   * today is `E2EE_V1` (`E2eeService.CreateE2eeConversation` is the only way to create one, and
   * `E2eeService.SendEnvelopes` the only way to add a message to one) — this service only lists,
   * reads, and tracks membership/read-state for conversations, never their content. The plaintext
   * send/read/request RPCs this service used to carry (`SendMessage`, `ListMessages`,
   * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
   * ADR 0030's pre-alpha consolidation policy the same change set E2EE-only conversations shipped
   * in — never federated (ADR 0020 §13).
   * </pre>
   */
  public static final class DirectMessageServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<DirectMessageServiceFutureStub> {
    private DirectMessageServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected DirectMessageServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new DirectMessageServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Messages.ListConversationsResponse> listConversations(
        patches.v1.Messages.ListConversationsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListConversationsMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Messages.GetConversationResponse> getConversation(
        patches.v1.Messages.GetConversationRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetConversationMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Always rejected with `UNIMPLEMENTED` (ADR 0030 §B-095): every conversation is `E2EE_V1`,
     * so leaving is a group-control transition — a silent `left_at` flip would desync the
     * membership epoch and roster chain every other member verifies. Self-removal goes through
     * `E2eeService.RemoveE2eeMember` with `actor_id` set to the caller.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Messages.LeaveConversationResponse> leaveConversation(
        patches.v1.Messages.LeaveConversationRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getLeaveConversationMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Messages.MarkConversationReadResponse> markConversationRead(
        patches.v1.Messages.MarkConversationReadRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getMarkConversationReadMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_LIST_CONVERSATIONS = 0;
  private static final int METHODID_GET_CONVERSATION = 1;
  private static final int METHODID_LEAVE_CONVERSATION = 2;
  private static final int METHODID_MARK_CONVERSATION_READ = 3;

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
        case METHODID_LIST_CONVERSATIONS:
          serviceImpl.listConversations((patches.v1.Messages.ListConversationsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Messages.ListConversationsResponse>) responseObserver);
          break;
        case METHODID_GET_CONVERSATION:
          serviceImpl.getConversation((patches.v1.Messages.GetConversationRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Messages.GetConversationResponse>) responseObserver);
          break;
        case METHODID_LEAVE_CONVERSATION:
          serviceImpl.leaveConversation((patches.v1.Messages.LeaveConversationRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Messages.LeaveConversationResponse>) responseObserver);
          break;
        case METHODID_MARK_CONVERSATION_READ:
          serviceImpl.markConversationRead((patches.v1.Messages.MarkConversationReadRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Messages.MarkConversationReadResponse>) responseObserver);
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
          getListConversationsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Messages.ListConversationsRequest,
              patches.v1.Messages.ListConversationsResponse>(
                service, METHODID_LIST_CONVERSATIONS)))
        .addMethod(
          getGetConversationMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Messages.GetConversationRequest,
              patches.v1.Messages.GetConversationResponse>(
                service, METHODID_GET_CONVERSATION)))
        .addMethod(
          getLeaveConversationMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Messages.LeaveConversationRequest,
              patches.v1.Messages.LeaveConversationResponse>(
                service, METHODID_LEAVE_CONVERSATION)))
        .addMethod(
          getMarkConversationReadMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Messages.MarkConversationReadRequest,
              patches.v1.Messages.MarkConversationReadResponse>(
                service, METHODID_MARK_CONVERSATION_READ)))
        .build();
  }

  private static abstract class DirectMessageServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    DirectMessageServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Messages.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("DirectMessageService");
    }
  }

  private static final class DirectMessageServiceFileDescriptorSupplier
      extends DirectMessageServiceBaseDescriptorSupplier {
    DirectMessageServiceFileDescriptorSupplier() {}
  }

  private static final class DirectMessageServiceMethodDescriptorSupplier
      extends DirectMessageServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    DirectMessageServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (DirectMessageServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new DirectMessageServiceFileDescriptorSupplier())
              .addMethod(getListConversationsMethod())
              .addMethod(getGetConversationMethod())
              .addMethod(getLeaveConversationMethod())
              .addMethod(getMarkConversationReadMethod())
              .build();
        }
      }
    }
    return result;
  }
}
