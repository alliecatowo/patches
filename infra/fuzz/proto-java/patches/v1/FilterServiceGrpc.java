package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Bring-your-own filters (spec §198). A filter is a named, viewer-owned rule that removes or
 * conceals posts — it never adds, reorders, or scores anything (§198.1, §208). Evaluated
 * server-side at the same chokepoint blocks/mutes already flow through (§198.4): every client
 * sees the same timeline, and pagination stays correct. Filter terms are always literal —
 * user-supplied regular expressions are prohibited in v1 (§198.2, §208).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/filters.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class FilterServiceGrpc {

  private FilterServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.FilterService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Filters.CreateFilterRequest,
      patches.v1.Filters.CreateFilterResponse> getCreateFilterMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateFilter",
      requestType = patches.v1.Filters.CreateFilterRequest.class,
      responseType = patches.v1.Filters.CreateFilterResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Filters.CreateFilterRequest,
      patches.v1.Filters.CreateFilterResponse> getCreateFilterMethod() {
    io.grpc.MethodDescriptor<patches.v1.Filters.CreateFilterRequest, patches.v1.Filters.CreateFilterResponse> getCreateFilterMethod;
    if ((getCreateFilterMethod = FilterServiceGrpc.getCreateFilterMethod) == null) {
      synchronized (FilterServiceGrpc.class) {
        if ((getCreateFilterMethod = FilterServiceGrpc.getCreateFilterMethod) == null) {
          FilterServiceGrpc.getCreateFilterMethod = getCreateFilterMethod =
              io.grpc.MethodDescriptor.<patches.v1.Filters.CreateFilterRequest, patches.v1.Filters.CreateFilterResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateFilter"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.CreateFilterRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.CreateFilterResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterServiceMethodDescriptorSupplier("CreateFilter"))
              .build();
        }
      }
    }
    return getCreateFilterMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Filters.UpdateFilterRequest,
      patches.v1.Filters.UpdateFilterResponse> getUpdateFilterMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateFilter",
      requestType = patches.v1.Filters.UpdateFilterRequest.class,
      responseType = patches.v1.Filters.UpdateFilterResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Filters.UpdateFilterRequest,
      patches.v1.Filters.UpdateFilterResponse> getUpdateFilterMethod() {
    io.grpc.MethodDescriptor<patches.v1.Filters.UpdateFilterRequest, patches.v1.Filters.UpdateFilterResponse> getUpdateFilterMethod;
    if ((getUpdateFilterMethod = FilterServiceGrpc.getUpdateFilterMethod) == null) {
      synchronized (FilterServiceGrpc.class) {
        if ((getUpdateFilterMethod = FilterServiceGrpc.getUpdateFilterMethod) == null) {
          FilterServiceGrpc.getUpdateFilterMethod = getUpdateFilterMethod =
              io.grpc.MethodDescriptor.<patches.v1.Filters.UpdateFilterRequest, patches.v1.Filters.UpdateFilterResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateFilter"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.UpdateFilterRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.UpdateFilterResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterServiceMethodDescriptorSupplier("UpdateFilter"))
              .build();
        }
      }
    }
    return getUpdateFilterMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Filters.DeleteFilterRequest,
      patches.v1.Filters.DeleteFilterResponse> getDeleteFilterMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "DeleteFilter",
      requestType = patches.v1.Filters.DeleteFilterRequest.class,
      responseType = patches.v1.Filters.DeleteFilterResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Filters.DeleteFilterRequest,
      patches.v1.Filters.DeleteFilterResponse> getDeleteFilterMethod() {
    io.grpc.MethodDescriptor<patches.v1.Filters.DeleteFilterRequest, patches.v1.Filters.DeleteFilterResponse> getDeleteFilterMethod;
    if ((getDeleteFilterMethod = FilterServiceGrpc.getDeleteFilterMethod) == null) {
      synchronized (FilterServiceGrpc.class) {
        if ((getDeleteFilterMethod = FilterServiceGrpc.getDeleteFilterMethod) == null) {
          FilterServiceGrpc.getDeleteFilterMethod = getDeleteFilterMethod =
              io.grpc.MethodDescriptor.<patches.v1.Filters.DeleteFilterRequest, patches.v1.Filters.DeleteFilterResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "DeleteFilter"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.DeleteFilterRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.DeleteFilterResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterServiceMethodDescriptorSupplier("DeleteFilter"))
              .build();
        }
      }
    }
    return getDeleteFilterMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Filters.ListFiltersRequest,
      patches.v1.Filters.ListFiltersResponse> getListFiltersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListFilters",
      requestType = patches.v1.Filters.ListFiltersRequest.class,
      responseType = patches.v1.Filters.ListFiltersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Filters.ListFiltersRequest,
      patches.v1.Filters.ListFiltersResponse> getListFiltersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Filters.ListFiltersRequest, patches.v1.Filters.ListFiltersResponse> getListFiltersMethod;
    if ((getListFiltersMethod = FilterServiceGrpc.getListFiltersMethod) == null) {
      synchronized (FilterServiceGrpc.class) {
        if ((getListFiltersMethod = FilterServiceGrpc.getListFiltersMethod) == null) {
          FilterServiceGrpc.getListFiltersMethod = getListFiltersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Filters.ListFiltersRequest, patches.v1.Filters.ListFiltersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListFilters"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.ListFiltersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.ListFiltersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterServiceMethodDescriptorSupplier("ListFilters"))
              .build();
        }
      }
    }
    return getListFiltersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Filters.ExportFiltersRequest,
      patches.v1.Filters.ExportFiltersResponse> getExportFiltersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ExportFilters",
      requestType = patches.v1.Filters.ExportFiltersRequest.class,
      responseType = patches.v1.Filters.ExportFiltersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Filters.ExportFiltersRequest,
      patches.v1.Filters.ExportFiltersResponse> getExportFiltersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Filters.ExportFiltersRequest, patches.v1.Filters.ExportFiltersResponse> getExportFiltersMethod;
    if ((getExportFiltersMethod = FilterServiceGrpc.getExportFiltersMethod) == null) {
      synchronized (FilterServiceGrpc.class) {
        if ((getExportFiltersMethod = FilterServiceGrpc.getExportFiltersMethod) == null) {
          FilterServiceGrpc.getExportFiltersMethod = getExportFiltersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Filters.ExportFiltersRequest, patches.v1.Filters.ExportFiltersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ExportFilters"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.ExportFiltersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.ExportFiltersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterServiceMethodDescriptorSupplier("ExportFilters"))
              .build();
        }
      }
    }
    return getExportFiltersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Filters.ImportFiltersRequest,
      patches.v1.Filters.ImportFiltersResponse> getImportFiltersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ImportFilters",
      requestType = patches.v1.Filters.ImportFiltersRequest.class,
      responseType = patches.v1.Filters.ImportFiltersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Filters.ImportFiltersRequest,
      patches.v1.Filters.ImportFiltersResponse> getImportFiltersMethod() {
    io.grpc.MethodDescriptor<patches.v1.Filters.ImportFiltersRequest, patches.v1.Filters.ImportFiltersResponse> getImportFiltersMethod;
    if ((getImportFiltersMethod = FilterServiceGrpc.getImportFiltersMethod) == null) {
      synchronized (FilterServiceGrpc.class) {
        if ((getImportFiltersMethod = FilterServiceGrpc.getImportFiltersMethod) == null) {
          FilterServiceGrpc.getImportFiltersMethod = getImportFiltersMethod =
              io.grpc.MethodDescriptor.<patches.v1.Filters.ImportFiltersRequest, patches.v1.Filters.ImportFiltersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ImportFilters"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.ImportFiltersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Filters.ImportFiltersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterServiceMethodDescriptorSupplier("ImportFilters"))
              .build();
        }
      }
    }
    return getImportFiltersMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static FilterServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterServiceStub>() {
        @java.lang.Override
        public FilterServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterServiceStub(channel, callOptions);
        }
      };
    return FilterServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static FilterServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterServiceBlockingV2Stub>() {
        @java.lang.Override
        public FilterServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return FilterServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static FilterServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterServiceBlockingStub>() {
        @java.lang.Override
        public FilterServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterServiceBlockingStub(channel, callOptions);
        }
      };
    return FilterServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static FilterServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterServiceFutureStub>() {
        @java.lang.Override
        public FilterServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterServiceFutureStub(channel, callOptions);
        }
      };
    return FilterServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Bring-your-own filters (spec §198). A filter is a named, viewer-owned rule that removes or
   * conceals posts — it never adds, reorders, or scores anything (§198.1, §208). Evaluated
   * server-side at the same chokepoint blocks/mutes already flow through (§198.4): every client
   * sees the same timeline, and pagination stays correct. Filter terms are always literal —
   * user-supplied regular expressions are prohibited in v1 (§198.2, §208).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void createFilter(patches.v1.Filters.CreateFilterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.CreateFilterResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateFilterMethod(), responseObserver);
    }

    /**
     */
    default void updateFilter(patches.v1.Filters.UpdateFilterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.UpdateFilterResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateFilterMethod(), responseObserver);
    }

    /**
     */
    default void deleteFilter(patches.v1.Filters.DeleteFilterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.DeleteFilterResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getDeleteFilterMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own filters, most-recent first.
     * </pre>
     */
    default void listFilters(patches.v1.Filters.ListFiltersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.ListFiltersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListFiltersMethod(), responseObserver);
    }

    /**
     * <pre>
     * A plain, documented JSON export (spec §198.5) — never a binary blob, never executable.
     * </pre>
     */
    default void exportFilters(patches.v1.Filters.ExportFiltersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.ExportFiltersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getExportFiltersMethod(), responseObserver);
    }

    /**
     * <pre>
     * Additive and previewable: pass `apply = false` to see what would be added without
     * writing anything (spec §198.5).
     * </pre>
     */
    default void importFilters(patches.v1.Filters.ImportFiltersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.ImportFiltersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getImportFiltersMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service FilterService.
   * <pre>
   * Bring-your-own filters (spec §198). A filter is a named, viewer-owned rule that removes or
   * conceals posts — it never adds, reorders, or scores anything (§198.1, §208). Evaluated
   * server-side at the same chokepoint blocks/mutes already flow through (§198.4): every client
   * sees the same timeline, and pagination stays correct. Filter terms are always literal —
   * user-supplied regular expressions are prohibited in v1 (§198.2, §208).
   * </pre>
   */
  public static abstract class FilterServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return FilterServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service FilterService.
   * <pre>
   * Bring-your-own filters (spec §198). A filter is a named, viewer-owned rule that removes or
   * conceals posts — it never adds, reorders, or scores anything (§198.1, §208). Evaluated
   * server-side at the same chokepoint blocks/mutes already flow through (§198.4): every client
   * sees the same timeline, and pagination stays correct. Filter terms are always literal —
   * user-supplied regular expressions are prohibited in v1 (§198.2, §208).
   * </pre>
   */
  public static final class FilterServiceStub
      extends io.grpc.stub.AbstractAsyncStub<FilterServiceStub> {
    private FilterServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterServiceStub(channel, callOptions);
    }

    /**
     */
    public void createFilter(patches.v1.Filters.CreateFilterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.CreateFilterResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateFilterMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void updateFilter(patches.v1.Filters.UpdateFilterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.UpdateFilterResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateFilterMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void deleteFilter(patches.v1.Filters.DeleteFilterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.DeleteFilterResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getDeleteFilterMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own filters, most-recent first.
     * </pre>
     */
    public void listFilters(patches.v1.Filters.ListFiltersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.ListFiltersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListFiltersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * A plain, documented JSON export (spec §198.5) — never a binary blob, never executable.
     * </pre>
     */
    public void exportFilters(patches.v1.Filters.ExportFiltersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.ExportFiltersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getExportFiltersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Additive and previewable: pass `apply = false` to see what would be added without
     * writing anything (spec §198.5).
     * </pre>
     */
    public void importFilters(patches.v1.Filters.ImportFiltersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Filters.ImportFiltersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getImportFiltersMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service FilterService.
   * <pre>
   * Bring-your-own filters (spec §198). A filter is a named, viewer-owned rule that removes or
   * conceals posts — it never adds, reorders, or scores anything (§198.1, §208). Evaluated
   * server-side at the same chokepoint blocks/mutes already flow through (§198.4): every client
   * sees the same timeline, and pagination stays correct. Filter terms are always literal —
   * user-supplied regular expressions are prohibited in v1 (§198.2, §208).
   * </pre>
   */
  public static final class FilterServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<FilterServiceBlockingV2Stub> {
    private FilterServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Filters.CreateFilterResponse createFilter(patches.v1.Filters.CreateFilterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateFilterMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Filters.UpdateFilterResponse updateFilter(patches.v1.Filters.UpdateFilterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateFilterMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Filters.DeleteFilterResponse deleteFilter(patches.v1.Filters.DeleteFilterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getDeleteFilterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own filters, most-recent first.
     * </pre>
     */
    public patches.v1.Filters.ListFiltersResponse listFilters(patches.v1.Filters.ListFiltersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFiltersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A plain, documented JSON export (spec §198.5) — never a binary blob, never executable.
     * </pre>
     */
    public patches.v1.Filters.ExportFiltersResponse exportFilters(patches.v1.Filters.ExportFiltersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getExportFiltersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Additive and previewable: pass `apply = false` to see what would be added without
     * writing anything (spec §198.5).
     * </pre>
     */
    public patches.v1.Filters.ImportFiltersResponse importFilters(patches.v1.Filters.ImportFiltersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getImportFiltersMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service FilterService.
   * <pre>
   * Bring-your-own filters (spec §198). A filter is a named, viewer-owned rule that removes or
   * conceals posts — it never adds, reorders, or scores anything (§198.1, §208). Evaluated
   * server-side at the same chokepoint blocks/mutes already flow through (§198.4): every client
   * sees the same timeline, and pagination stays correct. Filter terms are always literal —
   * user-supplied regular expressions are prohibited in v1 (§198.2, §208).
   * </pre>
   */
  public static final class FilterServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<FilterServiceBlockingStub> {
    private FilterServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.Filters.CreateFilterResponse createFilter(patches.v1.Filters.CreateFilterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateFilterMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Filters.UpdateFilterResponse updateFilter(patches.v1.Filters.UpdateFilterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateFilterMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Filters.DeleteFilterResponse deleteFilter(patches.v1.Filters.DeleteFilterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getDeleteFilterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own filters, most-recent first.
     * </pre>
     */
    public patches.v1.Filters.ListFiltersResponse listFilters(patches.v1.Filters.ListFiltersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFiltersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * A plain, documented JSON export (spec §198.5) — never a binary blob, never executable.
     * </pre>
     */
    public patches.v1.Filters.ExportFiltersResponse exportFilters(patches.v1.Filters.ExportFiltersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getExportFiltersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Additive and previewable: pass `apply = false` to see what would be added without
     * writing anything (spec §198.5).
     * </pre>
     */
    public patches.v1.Filters.ImportFiltersResponse importFilters(patches.v1.Filters.ImportFiltersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getImportFiltersMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service FilterService.
   * <pre>
   * Bring-your-own filters (spec §198). A filter is a named, viewer-owned rule that removes or
   * conceals posts — it never adds, reorders, or scores anything (§198.1, §208). Evaluated
   * server-side at the same chokepoint blocks/mutes already flow through (§198.4): every client
   * sees the same timeline, and pagination stays correct. Filter terms are always literal —
   * user-supplied regular expressions are prohibited in v1 (§198.2, §208).
   * </pre>
   */
  public static final class FilterServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<FilterServiceFutureStub> {
    private FilterServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Filters.CreateFilterResponse> createFilter(
        patches.v1.Filters.CreateFilterRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateFilterMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Filters.UpdateFilterResponse> updateFilter(
        patches.v1.Filters.UpdateFilterRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateFilterMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Filters.DeleteFilterResponse> deleteFilter(
        patches.v1.Filters.DeleteFilterRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getDeleteFilterMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own filters, most-recent first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Filters.ListFiltersResponse> listFilters(
        patches.v1.Filters.ListFiltersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListFiltersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * A plain, documented JSON export (spec §198.5) — never a binary blob, never executable.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Filters.ExportFiltersResponse> exportFilters(
        patches.v1.Filters.ExportFiltersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getExportFiltersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Additive and previewable: pass `apply = false` to see what would be added without
     * writing anything (spec §198.5).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Filters.ImportFiltersResponse> importFilters(
        patches.v1.Filters.ImportFiltersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getImportFiltersMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_CREATE_FILTER = 0;
  private static final int METHODID_UPDATE_FILTER = 1;
  private static final int METHODID_DELETE_FILTER = 2;
  private static final int METHODID_LIST_FILTERS = 3;
  private static final int METHODID_EXPORT_FILTERS = 4;
  private static final int METHODID_IMPORT_FILTERS = 5;

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
        case METHODID_CREATE_FILTER:
          serviceImpl.createFilter((patches.v1.Filters.CreateFilterRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Filters.CreateFilterResponse>) responseObserver);
          break;
        case METHODID_UPDATE_FILTER:
          serviceImpl.updateFilter((patches.v1.Filters.UpdateFilterRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Filters.UpdateFilterResponse>) responseObserver);
          break;
        case METHODID_DELETE_FILTER:
          serviceImpl.deleteFilter((patches.v1.Filters.DeleteFilterRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Filters.DeleteFilterResponse>) responseObserver);
          break;
        case METHODID_LIST_FILTERS:
          serviceImpl.listFilters((patches.v1.Filters.ListFiltersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Filters.ListFiltersResponse>) responseObserver);
          break;
        case METHODID_EXPORT_FILTERS:
          serviceImpl.exportFilters((patches.v1.Filters.ExportFiltersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Filters.ExportFiltersResponse>) responseObserver);
          break;
        case METHODID_IMPORT_FILTERS:
          serviceImpl.importFilters((patches.v1.Filters.ImportFiltersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Filters.ImportFiltersResponse>) responseObserver);
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
          getCreateFilterMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Filters.CreateFilterRequest,
              patches.v1.Filters.CreateFilterResponse>(
                service, METHODID_CREATE_FILTER)))
        .addMethod(
          getUpdateFilterMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Filters.UpdateFilterRequest,
              patches.v1.Filters.UpdateFilterResponse>(
                service, METHODID_UPDATE_FILTER)))
        .addMethod(
          getDeleteFilterMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Filters.DeleteFilterRequest,
              patches.v1.Filters.DeleteFilterResponse>(
                service, METHODID_DELETE_FILTER)))
        .addMethod(
          getListFiltersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Filters.ListFiltersRequest,
              patches.v1.Filters.ListFiltersResponse>(
                service, METHODID_LIST_FILTERS)))
        .addMethod(
          getExportFiltersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Filters.ExportFiltersRequest,
              patches.v1.Filters.ExportFiltersResponse>(
                service, METHODID_EXPORT_FILTERS)))
        .addMethod(
          getImportFiltersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Filters.ImportFiltersRequest,
              patches.v1.Filters.ImportFiltersResponse>(
                service, METHODID_IMPORT_FILTERS)))
        .build();
  }

  private static abstract class FilterServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    FilterServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Filters.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("FilterService");
    }
  }

  private static final class FilterServiceFileDescriptorSupplier
      extends FilterServiceBaseDescriptorSupplier {
    FilterServiceFileDescriptorSupplier() {}
  }

  private static final class FilterServiceMethodDescriptorSupplier
      extends FilterServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    FilterServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (FilterServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new FilterServiceFileDescriptorSupplier())
              .addMethod(getCreateFilterMethod())
              .addMethod(getUpdateFilterMethod())
              .addMethod(getDeleteFilterMethod())
              .addMethod(getListFiltersMethod())
              .addMethod(getExportFiltersMethod())
              .addMethod(getImportFiltersMethod())
              .build();
        }
      }
    }
    return result;
  }
}
