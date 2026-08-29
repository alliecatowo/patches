package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * User-facing block/mute/report surface (spec §55, §61–64, Phase 6 spec §140). Moderator/admin
 * actions (resolving a report, suspending an account) are deliberately not here — spec §65
 * puts that in the admin CLI, not a user-facing gRPC service, and "no user-facing API should
 * expose internal moderator notes" (§55).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/moderation.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class ModerationServiceGrpc {

  private ModerationServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.ModerationService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.BlockActorRequest,
      patches.v1.Moderation.BlockActorResponse> getBlockActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BlockActor",
      requestType = patches.v1.Moderation.BlockActorRequest.class,
      responseType = patches.v1.Moderation.BlockActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.BlockActorRequest,
      patches.v1.Moderation.BlockActorResponse> getBlockActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.BlockActorRequest, patches.v1.Moderation.BlockActorResponse> getBlockActorMethod;
    if ((getBlockActorMethod = ModerationServiceGrpc.getBlockActorMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getBlockActorMethod = ModerationServiceGrpc.getBlockActorMethod) == null) {
          ModerationServiceGrpc.getBlockActorMethod = getBlockActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.BlockActorRequest, patches.v1.Moderation.BlockActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BlockActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.BlockActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.BlockActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("BlockActor"))
              .build();
        }
      }
    }
    return getBlockActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.UnblockActorRequest,
      patches.v1.Moderation.UnblockActorResponse> getUnblockActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnblockActor",
      requestType = patches.v1.Moderation.UnblockActorRequest.class,
      responseType = patches.v1.Moderation.UnblockActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.UnblockActorRequest,
      patches.v1.Moderation.UnblockActorResponse> getUnblockActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.UnblockActorRequest, patches.v1.Moderation.UnblockActorResponse> getUnblockActorMethod;
    if ((getUnblockActorMethod = ModerationServiceGrpc.getUnblockActorMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getUnblockActorMethod = ModerationServiceGrpc.getUnblockActorMethod) == null) {
          ModerationServiceGrpc.getUnblockActorMethod = getUnblockActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.UnblockActorRequest, patches.v1.Moderation.UnblockActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnblockActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.UnblockActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.UnblockActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("UnblockActor"))
              .build();
        }
      }
    }
    return getUnblockActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.MuteActorRequest,
      patches.v1.Moderation.MuteActorResponse> getMuteActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "MuteActor",
      requestType = patches.v1.Moderation.MuteActorRequest.class,
      responseType = patches.v1.Moderation.MuteActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.MuteActorRequest,
      patches.v1.Moderation.MuteActorResponse> getMuteActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.MuteActorRequest, patches.v1.Moderation.MuteActorResponse> getMuteActorMethod;
    if ((getMuteActorMethod = ModerationServiceGrpc.getMuteActorMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getMuteActorMethod = ModerationServiceGrpc.getMuteActorMethod) == null) {
          ModerationServiceGrpc.getMuteActorMethod = getMuteActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.MuteActorRequest, patches.v1.Moderation.MuteActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "MuteActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.MuteActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.MuteActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("MuteActor"))
              .build();
        }
      }
    }
    return getMuteActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.UnmuteActorRequest,
      patches.v1.Moderation.UnmuteActorResponse> getUnmuteActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnmuteActor",
      requestType = patches.v1.Moderation.UnmuteActorRequest.class,
      responseType = patches.v1.Moderation.UnmuteActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.UnmuteActorRequest,
      patches.v1.Moderation.UnmuteActorResponse> getUnmuteActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.UnmuteActorRequest, patches.v1.Moderation.UnmuteActorResponse> getUnmuteActorMethod;
    if ((getUnmuteActorMethod = ModerationServiceGrpc.getUnmuteActorMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getUnmuteActorMethod = ModerationServiceGrpc.getUnmuteActorMethod) == null) {
          ModerationServiceGrpc.getUnmuteActorMethod = getUnmuteActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.UnmuteActorRequest, patches.v1.Moderation.UnmuteActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnmuteActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.UnmuteActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.UnmuteActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("UnmuteActor"))
              .build();
        }
      }
    }
    return getUnmuteActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.ListBlocksRequest,
      patches.v1.Moderation.ListBlocksResponse> getListBlocksMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListBlocks",
      requestType = patches.v1.Moderation.ListBlocksRequest.class,
      responseType = patches.v1.Moderation.ListBlocksResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.ListBlocksRequest,
      patches.v1.Moderation.ListBlocksResponse> getListBlocksMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.ListBlocksRequest, patches.v1.Moderation.ListBlocksResponse> getListBlocksMethod;
    if ((getListBlocksMethod = ModerationServiceGrpc.getListBlocksMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getListBlocksMethod = ModerationServiceGrpc.getListBlocksMethod) == null) {
          ModerationServiceGrpc.getListBlocksMethod = getListBlocksMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.ListBlocksRequest, patches.v1.Moderation.ListBlocksResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListBlocks"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListBlocksRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListBlocksResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("ListBlocks"))
              .build();
        }
      }
    }
    return getListBlocksMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.ListMutesRequest,
      patches.v1.Moderation.ListMutesResponse> getListMutesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListMutes",
      requestType = patches.v1.Moderation.ListMutesRequest.class,
      responseType = patches.v1.Moderation.ListMutesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.ListMutesRequest,
      patches.v1.Moderation.ListMutesResponse> getListMutesMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.ListMutesRequest, patches.v1.Moderation.ListMutesResponse> getListMutesMethod;
    if ((getListMutesMethod = ModerationServiceGrpc.getListMutesMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getListMutesMethod = ModerationServiceGrpc.getListMutesMethod) == null) {
          ModerationServiceGrpc.getListMutesMethod = getListMutesMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.ListMutesRequest, patches.v1.Moderation.ListMutesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListMutes"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListMutesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListMutesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("ListMutes"))
              .build();
        }
      }
    }
    return getListMutesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.ReportPostRequest,
      patches.v1.Moderation.ReportPostResponse> getReportPostMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ReportPost",
      requestType = patches.v1.Moderation.ReportPostRequest.class,
      responseType = patches.v1.Moderation.ReportPostResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.ReportPostRequest,
      patches.v1.Moderation.ReportPostResponse> getReportPostMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.ReportPostRequest, patches.v1.Moderation.ReportPostResponse> getReportPostMethod;
    if ((getReportPostMethod = ModerationServiceGrpc.getReportPostMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getReportPostMethod = ModerationServiceGrpc.getReportPostMethod) == null) {
          ModerationServiceGrpc.getReportPostMethod = getReportPostMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.ReportPostRequest, patches.v1.Moderation.ReportPostResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ReportPost"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ReportPostRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ReportPostResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("ReportPost"))
              .build();
        }
      }
    }
    return getReportPostMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.ReportActorRequest,
      patches.v1.Moderation.ReportActorResponse> getReportActorMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ReportActor",
      requestType = patches.v1.Moderation.ReportActorRequest.class,
      responseType = patches.v1.Moderation.ReportActorResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.ReportActorRequest,
      patches.v1.Moderation.ReportActorResponse> getReportActorMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.ReportActorRequest, patches.v1.Moderation.ReportActorResponse> getReportActorMethod;
    if ((getReportActorMethod = ModerationServiceGrpc.getReportActorMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getReportActorMethod = ModerationServiceGrpc.getReportActorMethod) == null) {
          ModerationServiceGrpc.getReportActorMethod = getReportActorMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.ReportActorRequest, patches.v1.Moderation.ReportActorResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ReportActor"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ReportActorRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ReportActorResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("ReportActor"))
              .build();
        }
      }
    }
    return getReportActorMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.ReportE2eeMessageRequest,
      patches.v1.Moderation.ReportE2eeMessageResponse> getReportE2eeMessageMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ReportE2eeMessage",
      requestType = patches.v1.Moderation.ReportE2eeMessageRequest.class,
      responseType = patches.v1.Moderation.ReportE2eeMessageResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.ReportE2eeMessageRequest,
      patches.v1.Moderation.ReportE2eeMessageResponse> getReportE2eeMessageMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.ReportE2eeMessageRequest, patches.v1.Moderation.ReportE2eeMessageResponse> getReportE2eeMessageMethod;
    if ((getReportE2eeMessageMethod = ModerationServiceGrpc.getReportE2eeMessageMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getReportE2eeMessageMethod = ModerationServiceGrpc.getReportE2eeMessageMethod) == null) {
          ModerationServiceGrpc.getReportE2eeMessageMethod = getReportE2eeMessageMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.ReportE2eeMessageRequest, patches.v1.Moderation.ReportE2eeMessageResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ReportE2eeMessage"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ReportE2eeMessageRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ReportE2eeMessageResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("ReportE2eeMessage"))
              .build();
        }
      }
    }
    return getReportE2eeMessageMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.ListModerationLogRequest,
      patches.v1.Moderation.ListModerationLogResponse> getListModerationLogMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListModerationLog",
      requestType = patches.v1.Moderation.ListModerationLogRequest.class,
      responseType = patches.v1.Moderation.ListModerationLogResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.ListModerationLogRequest,
      patches.v1.Moderation.ListModerationLogResponse> getListModerationLogMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.ListModerationLogRequest, patches.v1.Moderation.ListModerationLogResponse> getListModerationLogMethod;
    if ((getListModerationLogMethod = ModerationServiceGrpc.getListModerationLogMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getListModerationLogMethod = ModerationServiceGrpc.getListModerationLogMethod) == null) {
          ModerationServiceGrpc.getListModerationLogMethod = getListModerationLogMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.ListModerationLogRequest, patches.v1.Moderation.ListModerationLogResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListModerationLog"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListModerationLogRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListModerationLogResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("ListModerationLog"))
              .build();
        }
      }
    }
    return getListModerationLogMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Moderation.ListMyModerationNoticesRequest,
      patches.v1.Moderation.ListMyModerationNoticesResponse> getListMyModerationNoticesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListMyModerationNotices",
      requestType = patches.v1.Moderation.ListMyModerationNoticesRequest.class,
      responseType = patches.v1.Moderation.ListMyModerationNoticesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Moderation.ListMyModerationNoticesRequest,
      patches.v1.Moderation.ListMyModerationNoticesResponse> getListMyModerationNoticesMethod() {
    io.grpc.MethodDescriptor<patches.v1.Moderation.ListMyModerationNoticesRequest, patches.v1.Moderation.ListMyModerationNoticesResponse> getListMyModerationNoticesMethod;
    if ((getListMyModerationNoticesMethod = ModerationServiceGrpc.getListMyModerationNoticesMethod) == null) {
      synchronized (ModerationServiceGrpc.class) {
        if ((getListMyModerationNoticesMethod = ModerationServiceGrpc.getListMyModerationNoticesMethod) == null) {
          ModerationServiceGrpc.getListMyModerationNoticesMethod = getListMyModerationNoticesMethod =
              io.grpc.MethodDescriptor.<patches.v1.Moderation.ListMyModerationNoticesRequest, patches.v1.Moderation.ListMyModerationNoticesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListMyModerationNotices"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListMyModerationNoticesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Moderation.ListMyModerationNoticesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new ModerationServiceMethodDescriptorSupplier("ListMyModerationNotices"))
              .build();
        }
      }
    }
    return getListMyModerationNoticesMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static ModerationServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ModerationServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ModerationServiceStub>() {
        @java.lang.Override
        public ModerationServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ModerationServiceStub(channel, callOptions);
        }
      };
    return ModerationServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static ModerationServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ModerationServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ModerationServiceBlockingV2Stub>() {
        @java.lang.Override
        public ModerationServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ModerationServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return ModerationServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static ModerationServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ModerationServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ModerationServiceBlockingStub>() {
        @java.lang.Override
        public ModerationServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ModerationServiceBlockingStub(channel, callOptions);
        }
      };
    return ModerationServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static ModerationServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<ModerationServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<ModerationServiceFutureStub>() {
        @java.lang.Override
        public ModerationServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new ModerationServiceFutureStub(channel, callOptions);
        }
      };
    return ModerationServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * User-facing block/mute/report surface (spec §55, §61–64, Phase 6 spec §140). Moderator/admin
   * actions (resolving a report, suspending an account) are deliberately not here — spec §65
   * puts that in the admin CLI, not a user-facing gRPC service, and "no user-facing API should
   * expose internal moderator notes" (§55).
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Rejects a block in either direction of an existing follow by removing it (spec §62); the
     * relationship returned reflects that removal. Idempotent — blocking an already-blocked
     * actor is not an error.
     * </pre>
     */
    default void blockActor(patches.v1.Moderation.BlockActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.BlockActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBlockActorMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unblocking an actor the caller has not blocked is not an error.
     * </pre>
     */
    default void unblockActor(patches.v1.Moderation.UnblockActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.UnblockActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnblockActorMethod(), responseObserver);
    }

    /**
     */
    default void muteActor(patches.v1.Moderation.MuteActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.MuteActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getMuteActorMethod(), responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unmuting an actor the caller has not muted is not an error.
     * </pre>
     */
    default void unmuteActor(patches.v1.Moderation.UnmuteActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.UnmuteActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnmuteActorMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own block list, most-recent first.
     * </pre>
     */
    default void listBlocks(patches.v1.Moderation.ListBlocksRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListBlocksResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListBlocksMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own mute list, most-recent first.
     * </pre>
     */
    default void listMutes(patches.v1.Moderation.ListMutesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListMutesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListMutesMethod(), responseObserver);
    }

    /**
     */
    default void reportPost(patches.v1.Moderation.ReportPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportPostResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getReportPostMethod(), responseObserver);
    }

    /**
     */
    default void reportActor(patches.v1.Moderation.ReportActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportActorResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getReportActorMethod(), responseObserver);
    }

    /**
     * <pre>
     * A third sibling of `ReportPost`/`ReportActor`, not a generic report RPC (ADR 0020 §9): the
     * node holds no plaintext for an E2EE logical message, so this creates an evidence-free
     * `Report` row keyed by `subject_e2ee_logical_message_id`. A follow-up
     * `E2eeService.AttachReportEvidence` call supplies the reporter-disclosed
     * plaintext/opening/franking material against this report id. `ReportMessage`, the plaintext
     * sibling this once had (snapshot-backed evidence for a server-visible DM), was removed by
     * ADR 0030 §B-095 alongside the rest of the server-visible DM machinery — `ReportE2eeMessage`
     * plus disclosed evidence is the whole moderation story for DMs now.
     * </pre>
     */
    default void reportE2eeMessage(patches.v1.Moderation.ReportE2eeMessageRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportE2eeMessageResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getReportE2eeMessageMethod(), responseObserver);
    }

    /**
     * <pre>
     * A public transparency instrument about the node's own conduct, not a public record of
     * any individual's conduct (spec §201.4). Unauthenticated. Domain entries are fully
     * identified; account/post/media entries are anonymized by construction — no handle, actor
     * id, or post id, ever.
     * </pre>
     */
    default void listModerationLog(patches.v1.Moderation.ListModerationLogRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListModerationLogResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListModerationLogMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own moderation notices — the private, notified, appealable read projection
     * of `admin_audit_log` rows that acted on them (spec §201.2).
     * </pre>
     */
    default void listMyModerationNotices(patches.v1.Moderation.ListMyModerationNoticesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListMyModerationNoticesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListMyModerationNoticesMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service ModerationService.
   * <pre>
   * User-facing block/mute/report surface (spec §55, §61–64, Phase 6 spec §140). Moderator/admin
   * actions (resolving a report, suspending an account) are deliberately not here — spec §65
   * puts that in the admin CLI, not a user-facing gRPC service, and "no user-facing API should
   * expose internal moderator notes" (§55).
   * </pre>
   */
  public static abstract class ModerationServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return ModerationServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service ModerationService.
   * <pre>
   * User-facing block/mute/report surface (spec §55, §61–64, Phase 6 spec §140). Moderator/admin
   * actions (resolving a report, suspending an account) are deliberately not here — spec §65
   * puts that in the admin CLI, not a user-facing gRPC service, and "no user-facing API should
   * expose internal moderator notes" (§55).
   * </pre>
   */
  public static final class ModerationServiceStub
      extends io.grpc.stub.AbstractAsyncStub<ModerationServiceStub> {
    private ModerationServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ModerationServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ModerationServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Rejects a block in either direction of an existing follow by removing it (spec §62); the
     * relationship returned reflects that removal. Idempotent — blocking an already-blocked
     * actor is not an error.
     * </pre>
     */
    public void blockActor(patches.v1.Moderation.BlockActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.BlockActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBlockActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unblocking an actor the caller has not blocked is not an error.
     * </pre>
     */
    public void unblockActor(patches.v1.Moderation.UnblockActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.UnblockActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnblockActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void muteActor(patches.v1.Moderation.MuteActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.MuteActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getMuteActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Idempotent: unmuting an actor the caller has not muted is not an error.
     * </pre>
     */
    public void unmuteActor(patches.v1.Moderation.UnmuteActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.UnmuteActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnmuteActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own block list, most-recent first.
     * </pre>
     */
    public void listBlocks(patches.v1.Moderation.ListBlocksRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListBlocksResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListBlocksMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own mute list, most-recent first.
     * </pre>
     */
    public void listMutes(patches.v1.Moderation.ListMutesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListMutesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListMutesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void reportPost(patches.v1.Moderation.ReportPostRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportPostResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getReportPostMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void reportActor(patches.v1.Moderation.ReportActorRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportActorResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getReportActorMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * A third sibling of `ReportPost`/`ReportActor`, not a generic report RPC (ADR 0020 §9): the
     * node holds no plaintext for an E2EE logical message, so this creates an evidence-free
     * `Report` row keyed by `subject_e2ee_logical_message_id`. A follow-up
     * `E2eeService.AttachReportEvidence` call supplies the reporter-disclosed
     * plaintext/opening/franking material against this report id. `ReportMessage`, the plaintext
     * sibling this once had (snapshot-backed evidence for a server-visible DM), was removed by
     * ADR 0030 §B-095 alongside the rest of the server-visible DM machinery — `ReportE2eeMessage`
     * plus disclosed evidence is the whole moderation story for DMs now.
     * </pre>
     */
    public void reportE2eeMessage(patches.v1.Moderation.ReportE2eeMessageRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportE2eeMessageResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getReportE2eeMessageMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * A public transparency instrument about the node's own conduct, not a public record of
     * any individual's conduct (spec §201.4). Unauthenticated. Domain entries are fully
     * identified; account/post/media entries are anonymized by construction — no handle, actor
     * id, or post id, ever.
     * </pre>
     */
    public void listModerationLog(patches.v1.Moderation.ListModerationLogRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListModerationLogResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListModerationLogMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own moderation notices — the private, notified, appealable read projection
     * of `admin_audit_log` rows that acted on them (spec §201.2).
     * </pre>
     */
    public void listMyModerationNotices(patches.v1.Moderation.ListMyModerationNoticesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Moderation.ListMyModerationNoticesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListMyModerationNoticesMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service ModerationService.
   * <pre>
   * User-facing block/mute/report surface (spec §55, §61–64, Phase 6 spec §140). Moderator/admin
   * actions (resolving a report, suspending an account) are deliberately not here — spec §65
   * puts that in the admin CLI, not a user-facing gRPC service, and "no user-facing API should
   * expose internal moderator notes" (§55).
   * </pre>
   */
  public static final class ModerationServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<ModerationServiceBlockingV2Stub> {
    private ModerationServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ModerationServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ModerationServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Rejects a block in either direction of an existing follow by removing it (spec §62); the
     * relationship returned reflects that removal. Idempotent — blocking an already-blocked
     * actor is not an error.
     * </pre>
     */
    public patches.v1.Moderation.BlockActorResponse blockActor(patches.v1.Moderation.BlockActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBlockActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unblocking an actor the caller has not blocked is not an error.
     * </pre>
     */
    public patches.v1.Moderation.UnblockActorResponse unblockActor(patches.v1.Moderation.UnblockActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnblockActorMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Moderation.MuteActorResponse muteActor(patches.v1.Moderation.MuteActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMuteActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unmuting an actor the caller has not muted is not an error.
     * </pre>
     */
    public patches.v1.Moderation.UnmuteActorResponse unmuteActor(patches.v1.Moderation.UnmuteActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnmuteActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own block list, most-recent first.
     * </pre>
     */
    public patches.v1.Moderation.ListBlocksResponse listBlocks(patches.v1.Moderation.ListBlocksRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListBlocksMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own mute list, most-recent first.
     * </pre>
     */
    public patches.v1.Moderation.ListMutesResponse listMutes(patches.v1.Moderation.ListMutesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMutesMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Moderation.ReportPostResponse reportPost(patches.v1.Moderation.ReportPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportPostMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Moderation.ReportActorResponse reportActor(patches.v1.Moderation.ReportActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A third sibling of `ReportPost`/`ReportActor`, not a generic report RPC (ADR 0020 §9): the
     * node holds no plaintext for an E2EE logical message, so this creates an evidence-free
     * `Report` row keyed by `subject_e2ee_logical_message_id`. A follow-up
     * `E2eeService.AttachReportEvidence` call supplies the reporter-disclosed
     * plaintext/opening/franking material against this report id. `ReportMessage`, the plaintext
     * sibling this once had (snapshot-backed evidence for a server-visible DM), was removed by
     * ADR 0030 §B-095 alongside the rest of the server-visible DM machinery — `ReportE2eeMessage`
     * plus disclosed evidence is the whole moderation story for DMs now.
     * </pre>
     */
    public patches.v1.Moderation.ReportE2eeMessageResponse reportE2eeMessage(patches.v1.Moderation.ReportE2eeMessageRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportE2eeMessageMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A public transparency instrument about the node's own conduct, not a public record of
     * any individual's conduct (spec §201.4). Unauthenticated. Domain entries are fully
     * identified; account/post/media entries are anonymized by construction — no handle, actor
     * id, or post id, ever.
     * </pre>
     */
    public patches.v1.Moderation.ListModerationLogResponse listModerationLog(patches.v1.Moderation.ListModerationLogRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListModerationLogMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own moderation notices — the private, notified, appealable read projection
     * of `admin_audit_log` rows that acted on them (spec §201.2).
     * </pre>
     */
    public patches.v1.Moderation.ListMyModerationNoticesResponse listMyModerationNotices(patches.v1.Moderation.ListMyModerationNoticesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMyModerationNoticesMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service ModerationService.
   * <pre>
   * User-facing block/mute/report surface (spec §55, §61–64, Phase 6 spec §140). Moderator/admin
   * actions (resolving a report, suspending an account) are deliberately not here — spec §65
   * puts that in the admin CLI, not a user-facing gRPC service, and "no user-facing API should
   * expose internal moderator notes" (§55).
   * </pre>
   */
  public static final class ModerationServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<ModerationServiceBlockingStub> {
    private ModerationServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ModerationServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ModerationServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Rejects a block in either direction of an existing follow by removing it (spec §62); the
     * relationship returned reflects that removal. Idempotent — blocking an already-blocked
     * actor is not an error.
     * </pre>
     */
    public patches.v1.Moderation.BlockActorResponse blockActor(patches.v1.Moderation.BlockActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBlockActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unblocking an actor the caller has not blocked is not an error.
     * </pre>
     */
    public patches.v1.Moderation.UnblockActorResponse unblockActor(patches.v1.Moderation.UnblockActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnblockActorMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Moderation.MuteActorResponse muteActor(patches.v1.Moderation.MuteActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getMuteActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Idempotent: unmuting an actor the caller has not muted is not an error.
     * </pre>
     */
    public patches.v1.Moderation.UnmuteActorResponse unmuteActor(patches.v1.Moderation.UnmuteActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnmuteActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own block list, most-recent first.
     * </pre>
     */
    public patches.v1.Moderation.ListBlocksResponse listBlocks(patches.v1.Moderation.ListBlocksRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListBlocksMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own mute list, most-recent first.
     * </pre>
     */
    public patches.v1.Moderation.ListMutesResponse listMutes(patches.v1.Moderation.ListMutesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMutesMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Moderation.ReportPostResponse reportPost(patches.v1.Moderation.ReportPostRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportPostMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Moderation.ReportActorResponse reportActor(patches.v1.Moderation.ReportActorRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportActorMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A third sibling of `ReportPost`/`ReportActor`, not a generic report RPC (ADR 0020 §9): the
     * node holds no plaintext for an E2EE logical message, so this creates an evidence-free
     * `Report` row keyed by `subject_e2ee_logical_message_id`. A follow-up
     * `E2eeService.AttachReportEvidence` call supplies the reporter-disclosed
     * plaintext/opening/franking material against this report id. `ReportMessage`, the plaintext
     * sibling this once had (snapshot-backed evidence for a server-visible DM), was removed by
     * ADR 0030 §B-095 alongside the rest of the server-visible DM machinery — `ReportE2eeMessage`
     * plus disclosed evidence is the whole moderation story for DMs now.
     * </pre>
     */
    public patches.v1.Moderation.ReportE2eeMessageResponse reportE2eeMessage(patches.v1.Moderation.ReportE2eeMessageRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportE2eeMessageMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A public transparency instrument about the node's own conduct, not a public record of
     * any individual's conduct (spec §201.4). Unauthenticated. Domain entries are fully
     * identified; account/post/media entries are anonymized by construction — no handle, actor
     * id, or post id, ever.
     * </pre>
     */
    public patches.v1.Moderation.ListModerationLogResponse listModerationLog(patches.v1.Moderation.ListModerationLogRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListModerationLogMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own moderation notices — the private, notified, appealable read projection
     * of `admin_audit_log` rows that acted on them (spec §201.2).
     * </pre>
     */
    public patches.v1.Moderation.ListMyModerationNoticesResponse listMyModerationNotices(patches.v1.Moderation.ListMyModerationNoticesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMyModerationNoticesMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service ModerationService.
   * <pre>
   * User-facing block/mute/report surface (spec §55, §61–64, Phase 6 spec §140). Moderator/admin
   * actions (resolving a report, suspending an account) are deliberately not here — spec §65
   * puts that in the admin CLI, not a user-facing gRPC service, and "no user-facing API should
   * expose internal moderator notes" (§55).
   * </pre>
   */
  public static final class ModerationServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<ModerationServiceFutureStub> {
    private ModerationServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected ModerationServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new ModerationServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Rejects a block in either direction of an existing follow by removing it (spec §62); the
     * relationship returned reflects that removal. Idempotent — blocking an already-blocked
     * actor is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.BlockActorResponse> blockActor(
        patches.v1.Moderation.BlockActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBlockActorMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unblocking an actor the caller has not blocked is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.UnblockActorResponse> unblockActor(
        patches.v1.Moderation.UnblockActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnblockActorMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.MuteActorResponse> muteActor(
        patches.v1.Moderation.MuteActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getMuteActorMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Idempotent: unmuting an actor the caller has not muted is not an error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.UnmuteActorResponse> unmuteActor(
        patches.v1.Moderation.UnmuteActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnmuteActorMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own block list, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.ListBlocksResponse> listBlocks(
        patches.v1.Moderation.ListBlocksRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListBlocksMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own mute list, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.ListMutesResponse> listMutes(
        patches.v1.Moderation.ListMutesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListMutesMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.ReportPostResponse> reportPost(
        patches.v1.Moderation.ReportPostRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getReportPostMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.ReportActorResponse> reportActor(
        patches.v1.Moderation.ReportActorRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getReportActorMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * A third sibling of `ReportPost`/`ReportActor`, not a generic report RPC (ADR 0020 §9): the
     * node holds no plaintext for an E2EE logical message, so this creates an evidence-free
     * `Report` row keyed by `subject_e2ee_logical_message_id`. A follow-up
     * `E2eeService.AttachReportEvidence` call supplies the reporter-disclosed
     * plaintext/opening/franking material against this report id. `ReportMessage`, the plaintext
     * sibling this once had (snapshot-backed evidence for a server-visible DM), was removed by
     * ADR 0030 §B-095 alongside the rest of the server-visible DM machinery — `ReportE2eeMessage`
     * plus disclosed evidence is the whole moderation story for DMs now.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.ReportE2eeMessageResponse> reportE2eeMessage(
        patches.v1.Moderation.ReportE2eeMessageRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getReportE2eeMessageMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * A public transparency instrument about the node's own conduct, not a public record of
     * any individual's conduct (spec §201.4). Unauthenticated. Domain entries are fully
     * identified; account/post/media entries are anonymized by construction — no handle, actor
     * id, or post id, ever.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.ListModerationLogResponse> listModerationLog(
        patches.v1.Moderation.ListModerationLogRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListModerationLogMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own moderation notices — the private, notified, appealable read projection
     * of `admin_audit_log` rows that acted on them (spec §201.2).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Moderation.ListMyModerationNoticesResponse> listMyModerationNotices(
        patches.v1.Moderation.ListMyModerationNoticesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListMyModerationNoticesMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_BLOCK_ACTOR = 0;
  private static final int METHODID_UNBLOCK_ACTOR = 1;
  private static final int METHODID_MUTE_ACTOR = 2;
  private static final int METHODID_UNMUTE_ACTOR = 3;
  private static final int METHODID_LIST_BLOCKS = 4;
  private static final int METHODID_LIST_MUTES = 5;
  private static final int METHODID_REPORT_POST = 6;
  private static final int METHODID_REPORT_ACTOR = 7;
  private static final int METHODID_REPORT_E2EE_MESSAGE = 8;
  private static final int METHODID_LIST_MODERATION_LOG = 9;
  private static final int METHODID_LIST_MY_MODERATION_NOTICES = 10;

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
        case METHODID_BLOCK_ACTOR:
          serviceImpl.blockActor((patches.v1.Moderation.BlockActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.BlockActorResponse>) responseObserver);
          break;
        case METHODID_UNBLOCK_ACTOR:
          serviceImpl.unblockActor((patches.v1.Moderation.UnblockActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.UnblockActorResponse>) responseObserver);
          break;
        case METHODID_MUTE_ACTOR:
          serviceImpl.muteActor((patches.v1.Moderation.MuteActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.MuteActorResponse>) responseObserver);
          break;
        case METHODID_UNMUTE_ACTOR:
          serviceImpl.unmuteActor((patches.v1.Moderation.UnmuteActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.UnmuteActorResponse>) responseObserver);
          break;
        case METHODID_LIST_BLOCKS:
          serviceImpl.listBlocks((patches.v1.Moderation.ListBlocksRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.ListBlocksResponse>) responseObserver);
          break;
        case METHODID_LIST_MUTES:
          serviceImpl.listMutes((patches.v1.Moderation.ListMutesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.ListMutesResponse>) responseObserver);
          break;
        case METHODID_REPORT_POST:
          serviceImpl.reportPost((patches.v1.Moderation.ReportPostRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportPostResponse>) responseObserver);
          break;
        case METHODID_REPORT_ACTOR:
          serviceImpl.reportActor((patches.v1.Moderation.ReportActorRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportActorResponse>) responseObserver);
          break;
        case METHODID_REPORT_E2EE_MESSAGE:
          serviceImpl.reportE2eeMessage((patches.v1.Moderation.ReportE2eeMessageRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.ReportE2eeMessageResponse>) responseObserver);
          break;
        case METHODID_LIST_MODERATION_LOG:
          serviceImpl.listModerationLog((patches.v1.Moderation.ListModerationLogRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.ListModerationLogResponse>) responseObserver);
          break;
        case METHODID_LIST_MY_MODERATION_NOTICES:
          serviceImpl.listMyModerationNotices((patches.v1.Moderation.ListMyModerationNoticesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Moderation.ListMyModerationNoticesResponse>) responseObserver);
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
          getBlockActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.BlockActorRequest,
              patches.v1.Moderation.BlockActorResponse>(
                service, METHODID_BLOCK_ACTOR)))
        .addMethod(
          getUnblockActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.UnblockActorRequest,
              patches.v1.Moderation.UnblockActorResponse>(
                service, METHODID_UNBLOCK_ACTOR)))
        .addMethod(
          getMuteActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.MuteActorRequest,
              patches.v1.Moderation.MuteActorResponse>(
                service, METHODID_MUTE_ACTOR)))
        .addMethod(
          getUnmuteActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.UnmuteActorRequest,
              patches.v1.Moderation.UnmuteActorResponse>(
                service, METHODID_UNMUTE_ACTOR)))
        .addMethod(
          getListBlocksMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.ListBlocksRequest,
              patches.v1.Moderation.ListBlocksResponse>(
                service, METHODID_LIST_BLOCKS)))
        .addMethod(
          getListMutesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.ListMutesRequest,
              patches.v1.Moderation.ListMutesResponse>(
                service, METHODID_LIST_MUTES)))
        .addMethod(
          getReportPostMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.ReportPostRequest,
              patches.v1.Moderation.ReportPostResponse>(
                service, METHODID_REPORT_POST)))
        .addMethod(
          getReportActorMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.ReportActorRequest,
              patches.v1.Moderation.ReportActorResponse>(
                service, METHODID_REPORT_ACTOR)))
        .addMethod(
          getReportE2eeMessageMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.ReportE2eeMessageRequest,
              patches.v1.Moderation.ReportE2eeMessageResponse>(
                service, METHODID_REPORT_E2EE_MESSAGE)))
        .addMethod(
          getListModerationLogMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.ListModerationLogRequest,
              patches.v1.Moderation.ListModerationLogResponse>(
                service, METHODID_LIST_MODERATION_LOG)))
        .addMethod(
          getListMyModerationNoticesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Moderation.ListMyModerationNoticesRequest,
              patches.v1.Moderation.ListMyModerationNoticesResponse>(
                service, METHODID_LIST_MY_MODERATION_NOTICES)))
        .build();
  }

  private static abstract class ModerationServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    ModerationServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Moderation.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("ModerationService");
    }
  }

  private static final class ModerationServiceFileDescriptorSupplier
      extends ModerationServiceBaseDescriptorSupplier {
    ModerationServiceFileDescriptorSupplier() {}
  }

  private static final class ModerationServiceMethodDescriptorSupplier
      extends ModerationServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    ModerationServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (ModerationServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new ModerationServiceFileDescriptorSupplier())
              .addMethod(getBlockActorMethod())
              .addMethod(getUnblockActorMethod())
              .addMethod(getMuteActorMethod())
              .addMethod(getUnmuteActorMethod())
              .addMethod(getListBlocksMethod())
              .addMethod(getListMutesMethod())
              .addMethod(getReportPostMethod())
              .addMethod(getReportActorMethod())
              .addMethod(getReportE2eeMessageMethod())
              .addMethod(getListModerationLogMethod())
              .addMethod(getListMyModerationNoticesMethod())
              .build();
        }
      }
    }
    return result;
  }
}
