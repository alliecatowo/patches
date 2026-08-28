package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Labelers and labels (spec §200): subscriber-scoped annotation, never global truth. A label
 * is visible only to actors subscribed to that labeler; labeling someone has no effect on
 * anyone who has not opted in. Labels never affect ordering and are never aggregated into a
 * count, a reputation, or a trust score, for anyone (§200.3, §208). Label values come from a
 * closed vocabulary published by the node (`NodeService.GetNodePolicy`) — free-text values
 * are prohibited (§200.2, §208).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/labels.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class LabelServiceGrpc {

  private LabelServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.LabelService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.CreateLabelerRequest,
      patches.v1.Labels.CreateLabelerResponse> getCreateLabelerMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateLabeler",
      requestType = patches.v1.Labels.CreateLabelerRequest.class,
      responseType = patches.v1.Labels.CreateLabelerResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.CreateLabelerRequest,
      patches.v1.Labels.CreateLabelerResponse> getCreateLabelerMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.CreateLabelerRequest, patches.v1.Labels.CreateLabelerResponse> getCreateLabelerMethod;
    if ((getCreateLabelerMethod = LabelServiceGrpc.getCreateLabelerMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getCreateLabelerMethod = LabelServiceGrpc.getCreateLabelerMethod) == null) {
          LabelServiceGrpc.getCreateLabelerMethod = getCreateLabelerMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.CreateLabelerRequest, patches.v1.Labels.CreateLabelerResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateLabeler"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.CreateLabelerRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.CreateLabelerResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("CreateLabeler"))
              .build();
        }
      }
    }
    return getCreateLabelerMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.GetLabelerRequest,
      patches.v1.Labels.GetLabelerResponse> getGetLabelerMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetLabeler",
      requestType = patches.v1.Labels.GetLabelerRequest.class,
      responseType = patches.v1.Labels.GetLabelerResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.GetLabelerRequest,
      patches.v1.Labels.GetLabelerResponse> getGetLabelerMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.GetLabelerRequest, patches.v1.Labels.GetLabelerResponse> getGetLabelerMethod;
    if ((getGetLabelerMethod = LabelServiceGrpc.getGetLabelerMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getGetLabelerMethod = LabelServiceGrpc.getGetLabelerMethod) == null) {
          LabelServiceGrpc.getGetLabelerMethod = getGetLabelerMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.GetLabelerRequest, patches.v1.Labels.GetLabelerResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetLabeler"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.GetLabelerRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.GetLabelerResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("GetLabeler"))
              .build();
        }
      }
    }
    return getGetLabelerMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.ListLabelersRequest,
      patches.v1.Labels.ListLabelersResponse> getListLabelersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListLabelers",
      requestType = patches.v1.Labels.ListLabelersRequest.class,
      responseType = patches.v1.Labels.ListLabelersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.ListLabelersRequest,
      patches.v1.Labels.ListLabelersResponse> getListLabelersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.ListLabelersRequest, patches.v1.Labels.ListLabelersResponse> getListLabelersMethod;
    if ((getListLabelersMethod = LabelServiceGrpc.getListLabelersMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getListLabelersMethod = LabelServiceGrpc.getListLabelersMethod) == null) {
          LabelServiceGrpc.getListLabelersMethod = getListLabelersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.ListLabelersRequest, patches.v1.Labels.ListLabelersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListLabelers"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.ListLabelersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.ListLabelersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("ListLabelers"))
              .build();
        }
      }
    }
    return getListLabelersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.ApplyLabelRequest,
      patches.v1.Labels.ApplyLabelResponse> getApplyLabelMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ApplyLabel",
      requestType = patches.v1.Labels.ApplyLabelRequest.class,
      responseType = patches.v1.Labels.ApplyLabelResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.ApplyLabelRequest,
      patches.v1.Labels.ApplyLabelResponse> getApplyLabelMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.ApplyLabelRequest, patches.v1.Labels.ApplyLabelResponse> getApplyLabelMethod;
    if ((getApplyLabelMethod = LabelServiceGrpc.getApplyLabelMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getApplyLabelMethod = LabelServiceGrpc.getApplyLabelMethod) == null) {
          LabelServiceGrpc.getApplyLabelMethod = getApplyLabelMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.ApplyLabelRequest, patches.v1.Labels.ApplyLabelResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ApplyLabel"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.ApplyLabelRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.ApplyLabelResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("ApplyLabel"))
              .build();
        }
      }
    }
    return getApplyLabelMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.RetractLabelRequest,
      patches.v1.Labels.RetractLabelResponse> getRetractLabelMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RetractLabel",
      requestType = patches.v1.Labels.RetractLabelRequest.class,
      responseType = patches.v1.Labels.RetractLabelResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.RetractLabelRequest,
      patches.v1.Labels.RetractLabelResponse> getRetractLabelMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.RetractLabelRequest, patches.v1.Labels.RetractLabelResponse> getRetractLabelMethod;
    if ((getRetractLabelMethod = LabelServiceGrpc.getRetractLabelMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getRetractLabelMethod = LabelServiceGrpc.getRetractLabelMethod) == null) {
          LabelServiceGrpc.getRetractLabelMethod = getRetractLabelMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.RetractLabelRequest, patches.v1.Labels.RetractLabelResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RetractLabel"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.RetractLabelRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.RetractLabelResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("RetractLabel"))
              .build();
        }
      }
    }
    return getRetractLabelMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.SubscribeLabelerRequest,
      patches.v1.Labels.SubscribeLabelerResponse> getSubscribeLabelerMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SubscribeLabeler",
      requestType = patches.v1.Labels.SubscribeLabelerRequest.class,
      responseType = patches.v1.Labels.SubscribeLabelerResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.SubscribeLabelerRequest,
      patches.v1.Labels.SubscribeLabelerResponse> getSubscribeLabelerMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.SubscribeLabelerRequest, patches.v1.Labels.SubscribeLabelerResponse> getSubscribeLabelerMethod;
    if ((getSubscribeLabelerMethod = LabelServiceGrpc.getSubscribeLabelerMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getSubscribeLabelerMethod = LabelServiceGrpc.getSubscribeLabelerMethod) == null) {
          LabelServiceGrpc.getSubscribeLabelerMethod = getSubscribeLabelerMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.SubscribeLabelerRequest, patches.v1.Labels.SubscribeLabelerResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SubscribeLabeler"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.SubscribeLabelerRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.SubscribeLabelerResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("SubscribeLabeler"))
              .build();
        }
      }
    }
    return getSubscribeLabelerMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.UnsubscribeLabelerRequest,
      patches.v1.Labels.UnsubscribeLabelerResponse> getUnsubscribeLabelerMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnsubscribeLabeler",
      requestType = patches.v1.Labels.UnsubscribeLabelerRequest.class,
      responseType = patches.v1.Labels.UnsubscribeLabelerResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.UnsubscribeLabelerRequest,
      patches.v1.Labels.UnsubscribeLabelerResponse> getUnsubscribeLabelerMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.UnsubscribeLabelerRequest, patches.v1.Labels.UnsubscribeLabelerResponse> getUnsubscribeLabelerMethod;
    if ((getUnsubscribeLabelerMethod = LabelServiceGrpc.getUnsubscribeLabelerMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getUnsubscribeLabelerMethod = LabelServiceGrpc.getUnsubscribeLabelerMethod) == null) {
          LabelServiceGrpc.getUnsubscribeLabelerMethod = getUnsubscribeLabelerMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.UnsubscribeLabelerRequest, patches.v1.Labels.UnsubscribeLabelerResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnsubscribeLabeler"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.UnsubscribeLabelerRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.UnsubscribeLabelerResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("UnsubscribeLabeler"))
              .build();
        }
      }
    }
    return getUnsubscribeLabelerMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.SetLabelerSubscriptionActionRequest,
      patches.v1.Labels.SetLabelerSubscriptionActionResponse> getSetLabelerSubscriptionActionMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SetLabelerSubscriptionAction",
      requestType = patches.v1.Labels.SetLabelerSubscriptionActionRequest.class,
      responseType = patches.v1.Labels.SetLabelerSubscriptionActionResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.SetLabelerSubscriptionActionRequest,
      patches.v1.Labels.SetLabelerSubscriptionActionResponse> getSetLabelerSubscriptionActionMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.SetLabelerSubscriptionActionRequest, patches.v1.Labels.SetLabelerSubscriptionActionResponse> getSetLabelerSubscriptionActionMethod;
    if ((getSetLabelerSubscriptionActionMethod = LabelServiceGrpc.getSetLabelerSubscriptionActionMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getSetLabelerSubscriptionActionMethod = LabelServiceGrpc.getSetLabelerSubscriptionActionMethod) == null) {
          LabelServiceGrpc.getSetLabelerSubscriptionActionMethod = getSetLabelerSubscriptionActionMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.SetLabelerSubscriptionActionRequest, patches.v1.Labels.SetLabelerSubscriptionActionResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SetLabelerSubscriptionAction"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.SetLabelerSubscriptionActionRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.SetLabelerSubscriptionActionResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("SetLabelerSubscriptionAction"))
              .build();
        }
      }
    }
    return getSetLabelerSubscriptionActionMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Labels.ListLabelsOnSubjectRequest,
      patches.v1.Labels.ListLabelsOnSubjectResponse> getListLabelsOnSubjectMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListLabelsOnSubject",
      requestType = patches.v1.Labels.ListLabelsOnSubjectRequest.class,
      responseType = patches.v1.Labels.ListLabelsOnSubjectResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Labels.ListLabelsOnSubjectRequest,
      patches.v1.Labels.ListLabelsOnSubjectResponse> getListLabelsOnSubjectMethod() {
    io.grpc.MethodDescriptor<patches.v1.Labels.ListLabelsOnSubjectRequest, patches.v1.Labels.ListLabelsOnSubjectResponse> getListLabelsOnSubjectMethod;
    if ((getListLabelsOnSubjectMethod = LabelServiceGrpc.getListLabelsOnSubjectMethod) == null) {
      synchronized (LabelServiceGrpc.class) {
        if ((getListLabelsOnSubjectMethod = LabelServiceGrpc.getListLabelsOnSubjectMethod) == null) {
          LabelServiceGrpc.getListLabelsOnSubjectMethod = getListLabelsOnSubjectMethod =
              io.grpc.MethodDescriptor.<patches.v1.Labels.ListLabelsOnSubjectRequest, patches.v1.Labels.ListLabelsOnSubjectResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListLabelsOnSubject"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.ListLabelsOnSubjectRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Labels.ListLabelsOnSubjectResponse.getDefaultInstance()))
              .setSchemaDescriptor(new LabelServiceMethodDescriptorSupplier("ListLabelsOnSubject"))
              .build();
        }
      }
    }
    return getListLabelsOnSubjectMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static LabelServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<LabelServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<LabelServiceStub>() {
        @java.lang.Override
        public LabelServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new LabelServiceStub(channel, callOptions);
        }
      };
    return LabelServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static LabelServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<LabelServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<LabelServiceBlockingV2Stub>() {
        @java.lang.Override
        public LabelServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new LabelServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return LabelServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static LabelServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<LabelServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<LabelServiceBlockingStub>() {
        @java.lang.Override
        public LabelServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new LabelServiceBlockingStub(channel, callOptions);
        }
      };
    return LabelServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static LabelServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<LabelServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<LabelServiceFutureStub>() {
        @java.lang.Override
        public LabelServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new LabelServiceFutureStub(channel, callOptions);
        }
      };
    return LabelServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Labelers and labels (spec §200): subscriber-scoped annotation, never global truth. A label
   * is visible only to actors subscribed to that labeler; labeling someone has no effect on
   * anyone who has not opted in. Labels never affect ordering and are never aggregated into a
   * count, a reputation, or a trust score, for anyone (§200.3, §208). Label values come from a
   * closed vocabulary published by the node (`NodeService.GetNodePolicy`) — free-text values
   * are prohibited (§200.2, §208).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void createLabeler(patches.v1.Labels.CreateLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.CreateLabelerResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateLabelerMethod(), responseObserver);
    }

    /**
     */
    default void getLabeler(patches.v1.Labels.GetLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.GetLabelerResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetLabelerMethod(), responseObserver);
    }

    /**
     */
    default void listLabelers(patches.v1.Labels.ListLabelersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.ListLabelersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListLabelersMethod(), responseObserver);
    }

    /**
     * <pre>
     * Rate-limited (spec §204) — a labeler that can label faster than a human can consider is
     * bot moderation at scale (§200.5). The applying actor's authority stops at their own
     * labeler; operating one grants no authority over any actor, post, community, or node.
     * </pre>
     */
    default void applyLabel(patches.v1.Labels.ApplyLabelRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.ApplyLabelResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getApplyLabelMethod(), responseObserver);
    }

    /**
     * <pre>
     * Sets `retracted_at` rather than deleting the row — retraction preserves history
     * (spec §200.1).
     * </pre>
     */
    default void retractLabel(patches.v1.Labels.RetractLabelRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.RetractLabelResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRetractLabelMethod(), responseObserver);
    }

    /**
     */
    default void subscribeLabeler(patches.v1.Labels.SubscribeLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.SubscribeLabelerResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSubscribeLabelerMethod(), responseObserver);
    }

    /**
     */
    default void unsubscribeLabeler(patches.v1.Labels.UnsubscribeLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.UnsubscribeLabelerResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnsubscribeLabelerMethod(), responseObserver);
    }

    /**
     * <pre>
     * Per-value action override for the caller's own subscription (spec §200.1's action map).
     * A viewer may set any value to `LABEL_ACTION_IGNORE` except a value the node has
     * designated legally mandatory (`LabelVocabularyEntry.mandatory`, spec §200.3).
     * </pre>
     */
    default void setLabelerSubscriptionAction(patches.v1.Labels.SetLabelerSubscriptionActionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.SetLabelerSubscriptionActionResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSetLabelerSubscriptionActionMethod(), responseObserver);
    }

    /**
     * <pre>
     * Pull-only self-inspection (spec §200.4) — an actor is never notified that they were
     * labeled; this is the only way to find out. A label with an enforcement consequence is
     * delivered separately as a moderation notice (`ModerationService.ListMyModerationNotices`).
     * </pre>
     */
    default void listLabelsOnSubject(patches.v1.Labels.ListLabelsOnSubjectRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.ListLabelsOnSubjectResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListLabelsOnSubjectMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service LabelService.
   * <pre>
   * Labelers and labels (spec §200): subscriber-scoped annotation, never global truth. A label
   * is visible only to actors subscribed to that labeler; labeling someone has no effect on
   * anyone who has not opted in. Labels never affect ordering and are never aggregated into a
   * count, a reputation, or a trust score, for anyone (§200.3, §208). Label values come from a
   * closed vocabulary published by the node (`NodeService.GetNodePolicy`) — free-text values
   * are prohibited (§200.2, §208).
   * </pre>
   */
  public static abstract class LabelServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return LabelServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service LabelService.
   * <pre>
   * Labelers and labels (spec §200): subscriber-scoped annotation, never global truth. A label
   * is visible only to actors subscribed to that labeler; labeling someone has no effect on
   * anyone who has not opted in. Labels never affect ordering and are never aggregated into a
   * count, a reputation, or a trust score, for anyone (§200.3, §208). Label values come from a
   * closed vocabulary published by the node (`NodeService.GetNodePolicy`) — free-text values
   * are prohibited (§200.2, §208).
   * </pre>
   */
  public static final class LabelServiceStub
      extends io.grpc.stub.AbstractAsyncStub<LabelServiceStub> {
    private LabelServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected LabelServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new LabelServiceStub(channel, callOptions);
    }

    /**
     */
    public void createLabeler(patches.v1.Labels.CreateLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.CreateLabelerResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateLabelerMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getLabeler(patches.v1.Labels.GetLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.GetLabelerResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetLabelerMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void listLabelers(patches.v1.Labels.ListLabelersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.ListLabelersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListLabelersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Rate-limited (spec §204) — a labeler that can label faster than a human can consider is
     * bot moderation at scale (§200.5). The applying actor's authority stops at their own
     * labeler; operating one grants no authority over any actor, post, community, or node.
     * </pre>
     */
    public void applyLabel(patches.v1.Labels.ApplyLabelRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.ApplyLabelResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getApplyLabelMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Sets `retracted_at` rather than deleting the row — retraction preserves history
     * (spec §200.1).
     * </pre>
     */
    public void retractLabel(patches.v1.Labels.RetractLabelRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.RetractLabelResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRetractLabelMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void subscribeLabeler(patches.v1.Labels.SubscribeLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.SubscribeLabelerResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSubscribeLabelerMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void unsubscribeLabeler(patches.v1.Labels.UnsubscribeLabelerRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.UnsubscribeLabelerResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnsubscribeLabelerMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Per-value action override for the caller's own subscription (spec §200.1's action map).
     * A viewer may set any value to `LABEL_ACTION_IGNORE` except a value the node has
     * designated legally mandatory (`LabelVocabularyEntry.mandatory`, spec §200.3).
     * </pre>
     */
    public void setLabelerSubscriptionAction(patches.v1.Labels.SetLabelerSubscriptionActionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.SetLabelerSubscriptionActionResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSetLabelerSubscriptionActionMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Pull-only self-inspection (spec §200.4) — an actor is never notified that they were
     * labeled; this is the only way to find out. A label with an enforcement consequence is
     * delivered separately as a moderation notice (`ModerationService.ListMyModerationNotices`).
     * </pre>
     */
    public void listLabelsOnSubject(patches.v1.Labels.ListLabelsOnSubjectRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Labels.ListLabelsOnSubjectResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListLabelsOnSubjectMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service LabelService.
   * <pre>
   * Labelers and labels (spec §200): subscriber-scoped annotation, never global truth. A label
   * is visible only to actors subscribed to that labeler; labeling someone has no effect on
   * anyone who has not opted in. Labels never affect ordering and are never aggregated into a
   * count, a reputation, or a trust score, for anyone (§200.3, §208). Label values come from a
   * closed vocabulary published by the node (`NodeService.GetNodePolicy`) — free-text values
   * are prohibited (§200.2, §208).
   * </pre>
   */
  public static final class LabelServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<LabelServiceBlockingV2Stub> {
    private LabelServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected LabelServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new LabelServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Labels.CreateLabelerResponse createLabeler(patches.v1.Labels.CreateLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateLabelerMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.GetLabelerResponse getLabeler(patches.v1.Labels.GetLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetLabelerMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.ListLabelersResponse listLabelers(patches.v1.Labels.ListLabelersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListLabelersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rate-limited (spec §204) — a labeler that can label faster than a human can consider is
     * bot moderation at scale (§200.5). The applying actor's authority stops at their own
     * labeler; operating one grants no authority over any actor, post, community, or node.
     * </pre>
     */
    public patches.v1.Labels.ApplyLabelResponse applyLabel(patches.v1.Labels.ApplyLabelRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getApplyLabelMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Sets `retracted_at` rather than deleting the row — retraction preserves history
     * (spec §200.1).
     * </pre>
     */
    public patches.v1.Labels.RetractLabelResponse retractLabel(patches.v1.Labels.RetractLabelRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRetractLabelMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.SubscribeLabelerResponse subscribeLabeler(patches.v1.Labels.SubscribeLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSubscribeLabelerMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.UnsubscribeLabelerResponse unsubscribeLabeler(patches.v1.Labels.UnsubscribeLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnsubscribeLabelerMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Per-value action override for the caller's own subscription (spec §200.1's action map).
     * A viewer may set any value to `LABEL_ACTION_IGNORE` except a value the node has
     * designated legally mandatory (`LabelVocabularyEntry.mandatory`, spec §200.3).
     * </pre>
     */
    public patches.v1.Labels.SetLabelerSubscriptionActionResponse setLabelerSubscriptionAction(patches.v1.Labels.SetLabelerSubscriptionActionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetLabelerSubscriptionActionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Pull-only self-inspection (spec §200.4) — an actor is never notified that they were
     * labeled; this is the only way to find out. A label with an enforcement consequence is
     * delivered separately as a moderation notice (`ModerationService.ListMyModerationNotices`).
     * </pre>
     */
    public patches.v1.Labels.ListLabelsOnSubjectResponse listLabelsOnSubject(patches.v1.Labels.ListLabelsOnSubjectRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListLabelsOnSubjectMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service LabelService.
   * <pre>
   * Labelers and labels (spec §200): subscriber-scoped annotation, never global truth. A label
   * is visible only to actors subscribed to that labeler; labeling someone has no effect on
   * anyone who has not opted in. Labels never affect ordering and are never aggregated into a
   * count, a reputation, or a trust score, for anyone (§200.3, §208). Label values come from a
   * closed vocabulary published by the node (`NodeService.GetNodePolicy`) — free-text values
   * are prohibited (§200.2, §208).
   * </pre>
   */
  public static final class LabelServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<LabelServiceBlockingStub> {
    private LabelServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected LabelServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new LabelServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Labels.CreateLabelerResponse createLabeler(patches.v1.Labels.CreateLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateLabelerMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.GetLabelerResponse getLabeler(patches.v1.Labels.GetLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetLabelerMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.ListLabelersResponse listLabelers(patches.v1.Labels.ListLabelersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListLabelersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rate-limited (spec §204) — a labeler that can label faster than a human can consider is
     * bot moderation at scale (§200.5). The applying actor's authority stops at their own
     * labeler; operating one grants no authority over any actor, post, community, or node.
     * </pre>
     */
    public patches.v1.Labels.ApplyLabelResponse applyLabel(patches.v1.Labels.ApplyLabelRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getApplyLabelMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Sets `retracted_at` rather than deleting the row — retraction preserves history
     * (spec §200.1).
     * </pre>
     */
    public patches.v1.Labels.RetractLabelResponse retractLabel(patches.v1.Labels.RetractLabelRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRetractLabelMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.SubscribeLabelerResponse subscribeLabeler(patches.v1.Labels.SubscribeLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSubscribeLabelerMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Labels.UnsubscribeLabelerResponse unsubscribeLabeler(patches.v1.Labels.UnsubscribeLabelerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnsubscribeLabelerMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Per-value action override for the caller's own subscription (spec §200.1's action map).
     * A viewer may set any value to `LABEL_ACTION_IGNORE` except a value the node has
     * designated legally mandatory (`LabelVocabularyEntry.mandatory`, spec §200.3).
     * </pre>
     */
    public patches.v1.Labels.SetLabelerSubscriptionActionResponse setLabelerSubscriptionAction(patches.v1.Labels.SetLabelerSubscriptionActionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetLabelerSubscriptionActionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Pull-only self-inspection (spec §200.4) — an actor is never notified that they were
     * labeled; this is the only way to find out. A label with an enforcement consequence is
     * delivered separately as a moderation notice (`ModerationService.ListMyModerationNotices`).
     * </pre>
     */
    public patches.v1.Labels.ListLabelsOnSubjectResponse listLabelsOnSubject(patches.v1.Labels.ListLabelsOnSubjectRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListLabelsOnSubjectMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service LabelService.
   * <pre>
   * Labelers and labels (spec §200): subscriber-scoped annotation, never global truth. A label
   * is visible only to actors subscribed to that labeler; labeling someone has no effect on
   * anyone who has not opted in. Labels never affect ordering and are never aggregated into a
   * count, a reputation, or a trust score, for anyone (§200.3, §208). Label values come from a
   * closed vocabulary published by the node (`NodeService.GetNodePolicy`) — free-text values
   * are prohibited (§200.2, §208).
   * </pre>
   */
  public static final class LabelServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<LabelServiceFutureStub> {
    private LabelServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected LabelServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new LabelServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.CreateLabelerResponse> createLabeler(
        patches.v1.Labels.CreateLabelerRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateLabelerMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.GetLabelerResponse> getLabeler(
        patches.v1.Labels.GetLabelerRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetLabelerMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.ListLabelersResponse> listLabelers(
        patches.v1.Labels.ListLabelersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListLabelersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Rate-limited (spec §204) — a labeler that can label faster than a human can consider is
     * bot moderation at scale (§200.5). The applying actor's authority stops at their own
     * labeler; operating one grants no authority over any actor, post, community, or node.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.ApplyLabelResponse> applyLabel(
        patches.v1.Labels.ApplyLabelRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getApplyLabelMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Sets `retracted_at` rather than deleting the row — retraction preserves history
     * (spec §200.1).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.RetractLabelResponse> retractLabel(
        patches.v1.Labels.RetractLabelRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRetractLabelMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.SubscribeLabelerResponse> subscribeLabeler(
        patches.v1.Labels.SubscribeLabelerRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSubscribeLabelerMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.UnsubscribeLabelerResponse> unsubscribeLabeler(
        patches.v1.Labels.UnsubscribeLabelerRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnsubscribeLabelerMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Per-value action override for the caller's own subscription (spec §200.1's action map).
     * A viewer may set any value to `LABEL_ACTION_IGNORE` except a value the node has
     * designated legally mandatory (`LabelVocabularyEntry.mandatory`, spec §200.3).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.SetLabelerSubscriptionActionResponse> setLabelerSubscriptionAction(
        patches.v1.Labels.SetLabelerSubscriptionActionRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSetLabelerSubscriptionActionMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Pull-only self-inspection (spec §200.4) — an actor is never notified that they were
     * labeled; this is the only way to find out. A label with an enforcement consequence is
     * delivered separately as a moderation notice (`ModerationService.ListMyModerationNotices`).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Labels.ListLabelsOnSubjectResponse> listLabelsOnSubject(
        patches.v1.Labels.ListLabelsOnSubjectRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListLabelsOnSubjectMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_CREATE_LABELER = 0;
  private static final int METHODID_GET_LABELER = 1;
  private static final int METHODID_LIST_LABELERS = 2;
  private static final int METHODID_APPLY_LABEL = 3;
  private static final int METHODID_RETRACT_LABEL = 4;
  private static final int METHODID_SUBSCRIBE_LABELER = 5;
  private static final int METHODID_UNSUBSCRIBE_LABELER = 6;
  private static final int METHODID_SET_LABELER_SUBSCRIPTION_ACTION = 7;
  private static final int METHODID_LIST_LABELS_ON_SUBJECT = 8;

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
        case METHODID_CREATE_LABELER:
          serviceImpl.createLabeler((patches.v1.Labels.CreateLabelerRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.CreateLabelerResponse>) responseObserver);
          break;
        case METHODID_GET_LABELER:
          serviceImpl.getLabeler((patches.v1.Labels.GetLabelerRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.GetLabelerResponse>) responseObserver);
          break;
        case METHODID_LIST_LABELERS:
          serviceImpl.listLabelers((patches.v1.Labels.ListLabelersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.ListLabelersResponse>) responseObserver);
          break;
        case METHODID_APPLY_LABEL:
          serviceImpl.applyLabel((patches.v1.Labels.ApplyLabelRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.ApplyLabelResponse>) responseObserver);
          break;
        case METHODID_RETRACT_LABEL:
          serviceImpl.retractLabel((patches.v1.Labels.RetractLabelRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.RetractLabelResponse>) responseObserver);
          break;
        case METHODID_SUBSCRIBE_LABELER:
          serviceImpl.subscribeLabeler((patches.v1.Labels.SubscribeLabelerRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.SubscribeLabelerResponse>) responseObserver);
          break;
        case METHODID_UNSUBSCRIBE_LABELER:
          serviceImpl.unsubscribeLabeler((patches.v1.Labels.UnsubscribeLabelerRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.UnsubscribeLabelerResponse>) responseObserver);
          break;
        case METHODID_SET_LABELER_SUBSCRIPTION_ACTION:
          serviceImpl.setLabelerSubscriptionAction((patches.v1.Labels.SetLabelerSubscriptionActionRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.SetLabelerSubscriptionActionResponse>) responseObserver);
          break;
        case METHODID_LIST_LABELS_ON_SUBJECT:
          serviceImpl.listLabelsOnSubject((patches.v1.Labels.ListLabelsOnSubjectRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Labels.ListLabelsOnSubjectResponse>) responseObserver);
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
          getCreateLabelerMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.CreateLabelerRequest,
              patches.v1.Labels.CreateLabelerResponse>(
                service, METHODID_CREATE_LABELER)))
        .addMethod(
          getGetLabelerMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.GetLabelerRequest,
              patches.v1.Labels.GetLabelerResponse>(
                service, METHODID_GET_LABELER)))
        .addMethod(
          getListLabelersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.ListLabelersRequest,
              patches.v1.Labels.ListLabelersResponse>(
                service, METHODID_LIST_LABELERS)))
        .addMethod(
          getApplyLabelMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.ApplyLabelRequest,
              patches.v1.Labels.ApplyLabelResponse>(
                service, METHODID_APPLY_LABEL)))
        .addMethod(
          getRetractLabelMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.RetractLabelRequest,
              patches.v1.Labels.RetractLabelResponse>(
                service, METHODID_RETRACT_LABEL)))
        .addMethod(
          getSubscribeLabelerMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.SubscribeLabelerRequest,
              patches.v1.Labels.SubscribeLabelerResponse>(
                service, METHODID_SUBSCRIBE_LABELER)))
        .addMethod(
          getUnsubscribeLabelerMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.UnsubscribeLabelerRequest,
              patches.v1.Labels.UnsubscribeLabelerResponse>(
                service, METHODID_UNSUBSCRIBE_LABELER)))
        .addMethod(
          getSetLabelerSubscriptionActionMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.SetLabelerSubscriptionActionRequest,
              patches.v1.Labels.SetLabelerSubscriptionActionResponse>(
                service, METHODID_SET_LABELER_SUBSCRIPTION_ACTION)))
        .addMethod(
          getListLabelsOnSubjectMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Labels.ListLabelsOnSubjectRequest,
              patches.v1.Labels.ListLabelsOnSubjectResponse>(
                service, METHODID_LIST_LABELS_ON_SUBJECT)))
        .build();
  }

  private static abstract class LabelServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    LabelServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Labels.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("LabelService");
    }
  }

  private static final class LabelServiceFileDescriptorSupplier
      extends LabelServiceBaseDescriptorSupplier {
    LabelServiceFileDescriptorSupplier() {}
  }

  private static final class LabelServiceMethodDescriptorSupplier
      extends LabelServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    LabelServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (LabelServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new LabelServiceFileDescriptorSupplier())
              .addMethod(getCreateLabelerMethod())
              .addMethod(getGetLabelerMethod())
              .addMethod(getListLabelersMethod())
              .addMethod(getApplyLabelMethod())
              .addMethod(getRetractLabelMethod())
              .addMethod(getSubscribeLabelerMethod())
              .addMethod(getUnsubscribeLabelerMethod())
              .addMethod(getSetLabelerSubscriptionActionMethod())
              .addMethod(getListLabelsOnSubjectMethod())
              .build();
        }
      }
    }
    return result;
  }
}
