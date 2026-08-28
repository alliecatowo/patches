package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Filter lists: publishable, subscribable, revocable (spec §199) — the decentralized
 * primitive, extending §111's A3 from shareable inclusion to shareable exclusion. A list is
 * data only: no code, no action, no scope, no ordering, no scores (§199.1). The subscriber
 * owns the action; the list author owns the entries — these never swap (§199.2), and a
 * subscription can never create a block (§199.2, §208). Subscriptions are evaluated live
 * against the list's current entries; entries are never copied into a subscriber's own
 * filters, so unsubscribing is instant and complete (§199.3).
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/filter_lists.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class FilterListServiceGrpc {

  private FilterListServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.FilterListService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.PublishFilterListRequest,
      patches.v1.FilterLists.PublishFilterListResponse> getPublishFilterListMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PublishFilterList",
      requestType = patches.v1.FilterLists.PublishFilterListRequest.class,
      responseType = patches.v1.FilterLists.PublishFilterListResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.PublishFilterListRequest,
      patches.v1.FilterLists.PublishFilterListResponse> getPublishFilterListMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.PublishFilterListRequest, patches.v1.FilterLists.PublishFilterListResponse> getPublishFilterListMethod;
    if ((getPublishFilterListMethod = FilterListServiceGrpc.getPublishFilterListMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getPublishFilterListMethod = FilterListServiceGrpc.getPublishFilterListMethod) == null) {
          FilterListServiceGrpc.getPublishFilterListMethod = getPublishFilterListMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.PublishFilterListRequest, patches.v1.FilterLists.PublishFilterListResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PublishFilterList"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.PublishFilterListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.PublishFilterListResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("PublishFilterList"))
              .build();
        }
      }
    }
    return getPublishFilterListMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.UpdateFilterListRequest,
      patches.v1.FilterLists.UpdateFilterListResponse> getUpdateFilterListMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdateFilterList",
      requestType = patches.v1.FilterLists.UpdateFilterListRequest.class,
      responseType = patches.v1.FilterLists.UpdateFilterListResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.UpdateFilterListRequest,
      patches.v1.FilterLists.UpdateFilterListResponse> getUpdateFilterListMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.UpdateFilterListRequest, patches.v1.FilterLists.UpdateFilterListResponse> getUpdateFilterListMethod;
    if ((getUpdateFilterListMethod = FilterListServiceGrpc.getUpdateFilterListMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getUpdateFilterListMethod = FilterListServiceGrpc.getUpdateFilterListMethod) == null) {
          FilterListServiceGrpc.getUpdateFilterListMethod = getUpdateFilterListMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.UpdateFilterListRequest, patches.v1.FilterLists.UpdateFilterListResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdateFilterList"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.UpdateFilterListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.UpdateFilterListResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("UpdateFilterList"))
              .build();
        }
      }
    }
    return getUpdateFilterListMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.DeleteFilterListRequest,
      patches.v1.FilterLists.DeleteFilterListResponse> getDeleteFilterListMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "DeleteFilterList",
      requestType = patches.v1.FilterLists.DeleteFilterListRequest.class,
      responseType = patches.v1.FilterLists.DeleteFilterListResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.DeleteFilterListRequest,
      patches.v1.FilterLists.DeleteFilterListResponse> getDeleteFilterListMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.DeleteFilterListRequest, patches.v1.FilterLists.DeleteFilterListResponse> getDeleteFilterListMethod;
    if ((getDeleteFilterListMethod = FilterListServiceGrpc.getDeleteFilterListMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getDeleteFilterListMethod = FilterListServiceGrpc.getDeleteFilterListMethod) == null) {
          FilterListServiceGrpc.getDeleteFilterListMethod = getDeleteFilterListMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.DeleteFilterListRequest, patches.v1.FilterLists.DeleteFilterListResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "DeleteFilterList"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.DeleteFilterListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.DeleteFilterListResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("DeleteFilterList"))
              .build();
        }
      }
    }
    return getDeleteFilterListMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.GetFilterListRequest,
      patches.v1.FilterLists.GetFilterListResponse> getGetFilterListMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetFilterList",
      requestType = patches.v1.FilterLists.GetFilterListRequest.class,
      responseType = patches.v1.FilterLists.GetFilterListResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.GetFilterListRequest,
      patches.v1.FilterLists.GetFilterListResponse> getGetFilterListMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.GetFilterListRequest, patches.v1.FilterLists.GetFilterListResponse> getGetFilterListMethod;
    if ((getGetFilterListMethod = FilterListServiceGrpc.getGetFilterListMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getGetFilterListMethod = FilterListServiceGrpc.getGetFilterListMethod) == null) {
          FilterListServiceGrpc.getGetFilterListMethod = getGetFilterListMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.GetFilterListRequest, patches.v1.FilterLists.GetFilterListResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetFilterList"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.GetFilterListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.GetFilterListResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("GetFilterList"))
              .build();
        }
      }
    }
    return getGetFilterListMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListsRequest,
      patches.v1.FilterLists.ListFilterListsResponse> getListFilterListsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListFilterLists",
      requestType = patches.v1.FilterLists.ListFilterListsRequest.class,
      responseType = patches.v1.FilterLists.ListFilterListsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListsRequest,
      patches.v1.FilterLists.ListFilterListsResponse> getListFilterListsMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListsRequest, patches.v1.FilterLists.ListFilterListsResponse> getListFilterListsMethod;
    if ((getListFilterListsMethod = FilterListServiceGrpc.getListFilterListsMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getListFilterListsMethod = FilterListServiceGrpc.getListFilterListsMethod) == null) {
          FilterListServiceGrpc.getListFilterListsMethod = getListFilterListsMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.ListFilterListsRequest, patches.v1.FilterLists.ListFilterListsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListFilterLists"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.ListFilterListsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.ListFilterListsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("ListFilterLists"))
              .build();
        }
      }
    }
    return getListFilterListsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListEntriesRequest,
      patches.v1.FilterLists.ListFilterListEntriesResponse> getListFilterListEntriesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListFilterListEntries",
      requestType = patches.v1.FilterLists.ListFilterListEntriesRequest.class,
      responseType = patches.v1.FilterLists.ListFilterListEntriesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListEntriesRequest,
      patches.v1.FilterLists.ListFilterListEntriesResponse> getListFilterListEntriesMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListEntriesRequest, patches.v1.FilterLists.ListFilterListEntriesResponse> getListFilterListEntriesMethod;
    if ((getListFilterListEntriesMethod = FilterListServiceGrpc.getListFilterListEntriesMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getListFilterListEntriesMethod = FilterListServiceGrpc.getListFilterListEntriesMethod) == null) {
          FilterListServiceGrpc.getListFilterListEntriesMethod = getListFilterListEntriesMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.ListFilterListEntriesRequest, patches.v1.FilterLists.ListFilterListEntriesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListFilterListEntries"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.ListFilterListEntriesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.ListFilterListEntriesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("ListFilterListEntries"))
              .build();
        }
      }
    }
    return getListFilterListEntriesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.SubscribeFilterListRequest,
      patches.v1.FilterLists.SubscribeFilterListResponse> getSubscribeFilterListMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SubscribeFilterList",
      requestType = patches.v1.FilterLists.SubscribeFilterListRequest.class,
      responseType = patches.v1.FilterLists.SubscribeFilterListResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.SubscribeFilterListRequest,
      patches.v1.FilterLists.SubscribeFilterListResponse> getSubscribeFilterListMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.SubscribeFilterListRequest, patches.v1.FilterLists.SubscribeFilterListResponse> getSubscribeFilterListMethod;
    if ((getSubscribeFilterListMethod = FilterListServiceGrpc.getSubscribeFilterListMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getSubscribeFilterListMethod = FilterListServiceGrpc.getSubscribeFilterListMethod) == null) {
          FilterListServiceGrpc.getSubscribeFilterListMethod = getSubscribeFilterListMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.SubscribeFilterListRequest, patches.v1.FilterLists.SubscribeFilterListResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SubscribeFilterList"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.SubscribeFilterListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.SubscribeFilterListResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("SubscribeFilterList"))
              .build();
        }
      }
    }
    return getSubscribeFilterListMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.UnsubscribeFilterListRequest,
      patches.v1.FilterLists.UnsubscribeFilterListResponse> getUnsubscribeFilterListMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UnsubscribeFilterList",
      requestType = patches.v1.FilterLists.UnsubscribeFilterListRequest.class,
      responseType = patches.v1.FilterLists.UnsubscribeFilterListResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.UnsubscribeFilterListRequest,
      patches.v1.FilterLists.UnsubscribeFilterListResponse> getUnsubscribeFilterListMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.UnsubscribeFilterListRequest, patches.v1.FilterLists.UnsubscribeFilterListResponse> getUnsubscribeFilterListMethod;
    if ((getUnsubscribeFilterListMethod = FilterListServiceGrpc.getUnsubscribeFilterListMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getUnsubscribeFilterListMethod = FilterListServiceGrpc.getUnsubscribeFilterListMethod) == null) {
          FilterListServiceGrpc.getUnsubscribeFilterListMethod = getUnsubscribeFilterListMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.UnsubscribeFilterListRequest, patches.v1.FilterLists.UnsubscribeFilterListResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UnsubscribeFilterList"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.UnsubscribeFilterListRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.UnsubscribeFilterListResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("UnsubscribeFilterList"))
              .build();
        }
      }
    }
    return getUnsubscribeFilterListMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListSubscriptionsRequest,
      patches.v1.FilterLists.ListFilterListSubscriptionsResponse> getListFilterListSubscriptionsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListFilterListSubscriptions",
      requestType = patches.v1.FilterLists.ListFilterListSubscriptionsRequest.class,
      responseType = patches.v1.FilterLists.ListFilterListSubscriptionsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListSubscriptionsRequest,
      patches.v1.FilterLists.ListFilterListSubscriptionsResponse> getListFilterListSubscriptionsMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.ListFilterListSubscriptionsRequest, patches.v1.FilterLists.ListFilterListSubscriptionsResponse> getListFilterListSubscriptionsMethod;
    if ((getListFilterListSubscriptionsMethod = FilterListServiceGrpc.getListFilterListSubscriptionsMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getListFilterListSubscriptionsMethod = FilterListServiceGrpc.getListFilterListSubscriptionsMethod) == null) {
          FilterListServiceGrpc.getListFilterListSubscriptionsMethod = getListFilterListSubscriptionsMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.ListFilterListSubscriptionsRequest, patches.v1.FilterLists.ListFilterListSubscriptionsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListFilterListSubscriptions"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.ListFilterListSubscriptionsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.ListFilterListSubscriptionsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("ListFilterListSubscriptions"))
              .build();
        }
      }
    }
    return getListFilterListSubscriptionsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.FilterLists.SetFilterListEntryExceptionRequest,
      patches.v1.FilterLists.SetFilterListEntryExceptionResponse> getSetFilterListEntryExceptionMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SetFilterListEntryException",
      requestType = patches.v1.FilterLists.SetFilterListEntryExceptionRequest.class,
      responseType = patches.v1.FilterLists.SetFilterListEntryExceptionResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.FilterLists.SetFilterListEntryExceptionRequest,
      patches.v1.FilterLists.SetFilterListEntryExceptionResponse> getSetFilterListEntryExceptionMethod() {
    io.grpc.MethodDescriptor<patches.v1.FilterLists.SetFilterListEntryExceptionRequest, patches.v1.FilterLists.SetFilterListEntryExceptionResponse> getSetFilterListEntryExceptionMethod;
    if ((getSetFilterListEntryExceptionMethod = FilterListServiceGrpc.getSetFilterListEntryExceptionMethod) == null) {
      synchronized (FilterListServiceGrpc.class) {
        if ((getSetFilterListEntryExceptionMethod = FilterListServiceGrpc.getSetFilterListEntryExceptionMethod) == null) {
          FilterListServiceGrpc.getSetFilterListEntryExceptionMethod = getSetFilterListEntryExceptionMethod =
              io.grpc.MethodDescriptor.<patches.v1.FilterLists.SetFilterListEntryExceptionRequest, patches.v1.FilterLists.SetFilterListEntryExceptionResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SetFilterListEntryException"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.SetFilterListEntryExceptionRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.FilterLists.SetFilterListEntryExceptionResponse.getDefaultInstance()))
              .setSchemaDescriptor(new FilterListServiceMethodDescriptorSupplier("SetFilterListEntryException"))
              .build();
        }
      }
    }
    return getSetFilterListEntryExceptionMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static FilterListServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterListServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterListServiceStub>() {
        @java.lang.Override
        public FilterListServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterListServiceStub(channel, callOptions);
        }
      };
    return FilterListServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static FilterListServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterListServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterListServiceBlockingV2Stub>() {
        @java.lang.Override
        public FilterListServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterListServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return FilterListServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static FilterListServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterListServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterListServiceBlockingStub>() {
        @java.lang.Override
        public FilterListServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterListServiceBlockingStub(channel, callOptions);
        }
      };
    return FilterListServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static FilterListServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<FilterListServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<FilterListServiceFutureStub>() {
        @java.lang.Override
        public FilterListServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new FilterListServiceFutureStub(channel, callOptions);
        }
      };
    return FilterListServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Filter lists: publishable, subscribable, revocable (spec §199) — the decentralized
   * primitive, extending §111's A3 from shareable inclusion to shareable exclusion. A list is
   * data only: no code, no action, no scope, no ordering, no scores (§199.1). The subscriber
   * owns the action; the list author owns the entries — these never swap (§199.2), and a
   * subscription can never create a block (§199.2, §208). Subscriptions are evaluated live
   * against the list's current entries; entries are never copied into a subscriber's own
   * filters, so unsubscribing is instant and complete (§199.3).
   * </pre>
   */
  public interface AsyncService {

    /**
     */
    default void publishFilterList(patches.v1.FilterLists.PublishFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.PublishFilterListResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPublishFilterListMethod(), responseObserver);
    }

    /**
     */
    default void updateFilterList(patches.v1.FilterLists.UpdateFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.UpdateFilterListResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdateFilterListMethod(), responseObserver);
    }

    /**
     */
    default void deleteFilterList(patches.v1.FilterLists.DeleteFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.DeleteFilterListResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getDeleteFilterListMethod(), responseObserver);
    }

    /**
     */
    default void getFilterList(patches.v1.FilterLists.GetFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.GetFilterListResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetFilterListMethod(), responseObserver);
    }

    /**
     * <pre>
     * Publicly published lists, most-recently-updated first.
     * </pre>
     */
    default void listFilterLists(patches.v1.FilterLists.ListFilterListsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListFilterListsMethod(), responseObserver);
    }

    /**
     * <pre>
     * The full entry set, visible to any subscriber at any time — an unauditable list is a
     * black box with authority (spec §199.3).
     * </pre>
     */
    default void listFilterListEntries(patches.v1.FilterLists.ListFilterListEntriesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListEntriesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListFilterListEntriesMethod(), responseObserver);
    }

    /**
     * <pre>
     * Applies the list's entries as filters/mutes with an action and scopes the subscriber
     * chooses, defaulting to `FILTER_ACTION_COLLAPSE` (spec §199.2). Never creates a block.
     * </pre>
     */
    default void subscribeFilterList(patches.v1.FilterLists.SubscribeFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.SubscribeFilterListResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSubscribeFilterListMethod(), responseObserver);
    }

    /**
     */
    default void unsubscribeFilterList(patches.v1.FilterLists.UnsubscribeFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.UnsubscribeFilterListResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUnsubscribeFilterListMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own subscriptions. Subscriber counts are never published anywhere (§199.3,
     * §208) — this is the caller's own list, not an aggregate.
     * </pre>
     */
    default void listFilterListSubscriptions(patches.v1.FilterLists.ListFilterListSubscriptionsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListSubscriptionsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListFilterListSubscriptionsMethod(), responseObserver);
    }

    /**
     * <pre>
     * "This list is right about everything except my friend" — an exception without
     * unsubscribing and without telling the list author (spec §199.3).
     * </pre>
     */
    default void setFilterListEntryException(patches.v1.FilterLists.SetFilterListEntryExceptionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.SetFilterListEntryExceptionResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSetFilterListEntryExceptionMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service FilterListService.
   * <pre>
   * Filter lists: publishable, subscribable, revocable (spec §199) — the decentralized
   * primitive, extending §111's A3 from shareable inclusion to shareable exclusion. A list is
   * data only: no code, no action, no scope, no ordering, no scores (§199.1). The subscriber
   * owns the action; the list author owns the entries — these never swap (§199.2), and a
   * subscription can never create a block (§199.2, §208). Subscriptions are evaluated live
   * against the list's current entries; entries are never copied into a subscriber's own
   * filters, so unsubscribing is instant and complete (§199.3).
   * </pre>
   */
  public static abstract class FilterListServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return FilterListServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service FilterListService.
   * <pre>
   * Filter lists: publishable, subscribable, revocable (spec §199) — the decentralized
   * primitive, extending §111's A3 from shareable inclusion to shareable exclusion. A list is
   * data only: no code, no action, no scope, no ordering, no scores (§199.1). The subscriber
   * owns the action; the list author owns the entries — these never swap (§199.2), and a
   * subscription can never create a block (§199.2, §208). Subscriptions are evaluated live
   * against the list's current entries; entries are never copied into a subscriber's own
   * filters, so unsubscribing is instant and complete (§199.3).
   * </pre>
   */
  public static final class FilterListServiceStub
      extends io.grpc.stub.AbstractAsyncStub<FilterListServiceStub> {
    private FilterListServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterListServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterListServiceStub(channel, callOptions);
    }

    /**
     */
    public void publishFilterList(patches.v1.FilterLists.PublishFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.PublishFilterListResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPublishFilterListMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void updateFilterList(patches.v1.FilterLists.UpdateFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.UpdateFilterListResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdateFilterListMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void deleteFilterList(patches.v1.FilterLists.DeleteFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.DeleteFilterListResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getDeleteFilterListMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void getFilterList(patches.v1.FilterLists.GetFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.GetFilterListResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetFilterListMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Publicly published lists, most-recently-updated first.
     * </pre>
     */
    public void listFilterLists(patches.v1.FilterLists.ListFilterListsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListFilterListsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The full entry set, visible to any subscriber at any time — an unauditable list is a
     * black box with authority (spec §199.3).
     * </pre>
     */
    public void listFilterListEntries(patches.v1.FilterLists.ListFilterListEntriesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListEntriesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListFilterListEntriesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Applies the list's entries as filters/mutes with an action and scopes the subscriber
     * chooses, defaulting to `FILTER_ACTION_COLLAPSE` (spec §199.2). Never creates a block.
     * </pre>
     */
    public void subscribeFilterList(patches.v1.FilterLists.SubscribeFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.SubscribeFilterListResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSubscribeFilterListMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void unsubscribeFilterList(patches.v1.FilterLists.UnsubscribeFilterListRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.UnsubscribeFilterListResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUnsubscribeFilterListMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own subscriptions. Subscriber counts are never published anywhere (§199.3,
     * §208) — this is the caller's own list, not an aggregate.
     * </pre>
     */
    public void listFilterListSubscriptions(patches.v1.FilterLists.ListFilterListSubscriptionsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListSubscriptionsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListFilterListSubscriptionsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * "This list is right about everything except my friend" — an exception without
     * unsubscribing and without telling the list author (spec §199.3).
     * </pre>
     */
    public void setFilterListEntryException(patches.v1.FilterLists.SetFilterListEntryExceptionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.FilterLists.SetFilterListEntryExceptionResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSetFilterListEntryExceptionMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service FilterListService.
   * <pre>
   * Filter lists: publishable, subscribable, revocable (spec §199) — the decentralized
   * primitive, extending §111's A3 from shareable inclusion to shareable exclusion. A list is
   * data only: no code, no action, no scope, no ordering, no scores (§199.1). The subscriber
   * owns the action; the list author owns the entries — these never swap (§199.2), and a
   * subscription can never create a block (§199.2, §208). Subscriptions are evaluated live
   * against the list's current entries; entries are never copied into a subscriber's own
   * filters, so unsubscribing is instant and complete (§199.3).
   * </pre>
   */
  public static final class FilterListServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<FilterListServiceBlockingV2Stub> {
    private FilterListServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterListServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterListServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     */
    public patches.v1.FilterLists.PublishFilterListResponse publishFilterList(patches.v1.FilterLists.PublishFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPublishFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.UpdateFilterListResponse updateFilterList(patches.v1.FilterLists.UpdateFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.DeleteFilterListResponse deleteFilterList(patches.v1.FilterLists.DeleteFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getDeleteFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.GetFilterListResponse getFilterList(patches.v1.FilterLists.GetFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetFilterListMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Publicly published lists, most-recently-updated first.
     * </pre>
     */
    public patches.v1.FilterLists.ListFilterListsResponse listFilterLists(patches.v1.FilterLists.ListFilterListsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFilterListsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The full entry set, visible to any subscriber at any time — an unauditable list is a
     * black box with authority (spec §199.3).
     * </pre>
     */
    public patches.v1.FilterLists.ListFilterListEntriesResponse listFilterListEntries(patches.v1.FilterLists.ListFilterListEntriesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFilterListEntriesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Applies the list's entries as filters/mutes with an action and scopes the subscriber
     * chooses, defaulting to `FILTER_ACTION_COLLAPSE` (spec §199.2). Never creates a block.
     * </pre>
     */
    public patches.v1.FilterLists.SubscribeFilterListResponse subscribeFilterList(patches.v1.FilterLists.SubscribeFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSubscribeFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.UnsubscribeFilterListResponse unsubscribeFilterList(patches.v1.FilterLists.UnsubscribeFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnsubscribeFilterListMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own subscriptions. Subscriber counts are never published anywhere (§199.3,
     * §208) — this is the caller's own list, not an aggregate.
     * </pre>
     */
    public patches.v1.FilterLists.ListFilterListSubscriptionsResponse listFilterListSubscriptions(patches.v1.FilterLists.ListFilterListSubscriptionsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFilterListSubscriptionsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * "This list is right about everything except my friend" — an exception without
     * unsubscribing and without telling the list author (spec §199.3).
     * </pre>
     */
    public patches.v1.FilterLists.SetFilterListEntryExceptionResponse setFilterListEntryException(patches.v1.FilterLists.SetFilterListEntryExceptionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetFilterListEntryExceptionMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service FilterListService.
   * <pre>
   * Filter lists: publishable, subscribable, revocable (spec §199) — the decentralized
   * primitive, extending §111's A3 from shareable inclusion to shareable exclusion. A list is
   * data only: no code, no action, no scope, no ordering, no scores (§199.1). The subscriber
   * owns the action; the list author owns the entries — these never swap (§199.2), and a
   * subscription can never create a block (§199.2, §208). Subscriptions are evaluated live
   * against the list's current entries; entries are never copied into a subscriber's own
   * filters, so unsubscribing is instant and complete (§199.3).
   * </pre>
   */
  public static final class FilterListServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<FilterListServiceBlockingStub> {
    private FilterListServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterListServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterListServiceBlockingStub(channel, callOptions);
    }

    /**
     */
    public patches.v1.FilterLists.PublishFilterListResponse publishFilterList(patches.v1.FilterLists.PublishFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPublishFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.UpdateFilterListResponse updateFilterList(patches.v1.FilterLists.UpdateFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdateFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.DeleteFilterListResponse deleteFilterList(patches.v1.FilterLists.DeleteFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getDeleteFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.GetFilterListResponse getFilterList(patches.v1.FilterLists.GetFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetFilterListMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Publicly published lists, most-recently-updated first.
     * </pre>
     */
    public patches.v1.FilterLists.ListFilterListsResponse listFilterLists(patches.v1.FilterLists.ListFilterListsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFilterListsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The full entry set, visible to any subscriber at any time — an unauditable list is a
     * black box with authority (spec §199.3).
     * </pre>
     */
    public patches.v1.FilterLists.ListFilterListEntriesResponse listFilterListEntries(patches.v1.FilterLists.ListFilterListEntriesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFilterListEntriesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Applies the list's entries as filters/mutes with an action and scopes the subscriber
     * chooses, defaulting to `FILTER_ACTION_COLLAPSE` (spec §199.2). Never creates a block.
     * </pre>
     */
    public patches.v1.FilterLists.SubscribeFilterListResponse subscribeFilterList(patches.v1.FilterLists.SubscribeFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSubscribeFilterListMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.FilterLists.UnsubscribeFilterListResponse unsubscribeFilterList(patches.v1.FilterLists.UnsubscribeFilterListRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUnsubscribeFilterListMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own subscriptions. Subscriber counts are never published anywhere (§199.3,
     * §208) — this is the caller's own list, not an aggregate.
     * </pre>
     */
    public patches.v1.FilterLists.ListFilterListSubscriptionsResponse listFilterListSubscriptions(patches.v1.FilterLists.ListFilterListSubscriptionsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListFilterListSubscriptionsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * "This list is right about everything except my friend" — an exception without
     * unsubscribing and without telling the list author (spec §199.3).
     * </pre>
     */
    public patches.v1.FilterLists.SetFilterListEntryExceptionResponse setFilterListEntryException(patches.v1.FilterLists.SetFilterListEntryExceptionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSetFilterListEntryExceptionMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service FilterListService.
   * <pre>
   * Filter lists: publishable, subscribable, revocable (spec §199) — the decentralized
   * primitive, extending §111's A3 from shareable inclusion to shareable exclusion. A list is
   * data only: no code, no action, no scope, no ordering, no scores (§199.1). The subscriber
   * owns the action; the list author owns the entries — these never swap (§199.2), and a
   * subscription can never create a block (§199.2, §208). Subscriptions are evaluated live
   * against the list's current entries; entries are never copied into a subscriber's own
   * filters, so unsubscribing is instant and complete (§199.3).
   * </pre>
   */
  public static final class FilterListServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<FilterListServiceFutureStub> {
    private FilterListServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected FilterListServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new FilterListServiceFutureStub(channel, callOptions);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.PublishFilterListResponse> publishFilterList(
        patches.v1.FilterLists.PublishFilterListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPublishFilterListMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.UpdateFilterListResponse> updateFilterList(
        patches.v1.FilterLists.UpdateFilterListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdateFilterListMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.DeleteFilterListResponse> deleteFilterList(
        patches.v1.FilterLists.DeleteFilterListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getDeleteFilterListMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.GetFilterListResponse> getFilterList(
        patches.v1.FilterLists.GetFilterListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetFilterListMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Publicly published lists, most-recently-updated first.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.ListFilterListsResponse> listFilterLists(
        patches.v1.FilterLists.ListFilterListsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListFilterListsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The full entry set, visible to any subscriber at any time — an unauditable list is a
     * black box with authority (spec §199.3).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.ListFilterListEntriesResponse> listFilterListEntries(
        patches.v1.FilterLists.ListFilterListEntriesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListFilterListEntriesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Applies the list's entries as filters/mutes with an action and scopes the subscriber
     * chooses, defaulting to `FILTER_ACTION_COLLAPSE` (spec §199.2). Never creates a block.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.SubscribeFilterListResponse> subscribeFilterList(
        patches.v1.FilterLists.SubscribeFilterListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSubscribeFilterListMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.UnsubscribeFilterListResponse> unsubscribeFilterList(
        patches.v1.FilterLists.UnsubscribeFilterListRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUnsubscribeFilterListMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own subscriptions. Subscriber counts are never published anywhere (§199.3,
     * §208) — this is the caller's own list, not an aggregate.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.ListFilterListSubscriptionsResponse> listFilterListSubscriptions(
        patches.v1.FilterLists.ListFilterListSubscriptionsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListFilterListSubscriptionsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * "This list is right about everything except my friend" — an exception without
     * unsubscribing and without telling the list author (spec §199.3).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.FilterLists.SetFilterListEntryExceptionResponse> setFilterListEntryException(
        patches.v1.FilterLists.SetFilterListEntryExceptionRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSetFilterListEntryExceptionMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_PUBLISH_FILTER_LIST = 0;
  private static final int METHODID_UPDATE_FILTER_LIST = 1;
  private static final int METHODID_DELETE_FILTER_LIST = 2;
  private static final int METHODID_GET_FILTER_LIST = 3;
  private static final int METHODID_LIST_FILTER_LISTS = 4;
  private static final int METHODID_LIST_FILTER_LIST_ENTRIES = 5;
  private static final int METHODID_SUBSCRIBE_FILTER_LIST = 6;
  private static final int METHODID_UNSUBSCRIBE_FILTER_LIST = 7;
  private static final int METHODID_LIST_FILTER_LIST_SUBSCRIPTIONS = 8;
  private static final int METHODID_SET_FILTER_LIST_ENTRY_EXCEPTION = 9;

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
        case METHODID_PUBLISH_FILTER_LIST:
          serviceImpl.publishFilterList((patches.v1.FilterLists.PublishFilterListRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.PublishFilterListResponse>) responseObserver);
          break;
        case METHODID_UPDATE_FILTER_LIST:
          serviceImpl.updateFilterList((patches.v1.FilterLists.UpdateFilterListRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.UpdateFilterListResponse>) responseObserver);
          break;
        case METHODID_DELETE_FILTER_LIST:
          serviceImpl.deleteFilterList((patches.v1.FilterLists.DeleteFilterListRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.DeleteFilterListResponse>) responseObserver);
          break;
        case METHODID_GET_FILTER_LIST:
          serviceImpl.getFilterList((patches.v1.FilterLists.GetFilterListRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.GetFilterListResponse>) responseObserver);
          break;
        case METHODID_LIST_FILTER_LISTS:
          serviceImpl.listFilterLists((patches.v1.FilterLists.ListFilterListsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListsResponse>) responseObserver);
          break;
        case METHODID_LIST_FILTER_LIST_ENTRIES:
          serviceImpl.listFilterListEntries((patches.v1.FilterLists.ListFilterListEntriesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListEntriesResponse>) responseObserver);
          break;
        case METHODID_SUBSCRIBE_FILTER_LIST:
          serviceImpl.subscribeFilterList((patches.v1.FilterLists.SubscribeFilterListRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.SubscribeFilterListResponse>) responseObserver);
          break;
        case METHODID_UNSUBSCRIBE_FILTER_LIST:
          serviceImpl.unsubscribeFilterList((patches.v1.FilterLists.UnsubscribeFilterListRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.UnsubscribeFilterListResponse>) responseObserver);
          break;
        case METHODID_LIST_FILTER_LIST_SUBSCRIPTIONS:
          serviceImpl.listFilterListSubscriptions((patches.v1.FilterLists.ListFilterListSubscriptionsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.ListFilterListSubscriptionsResponse>) responseObserver);
          break;
        case METHODID_SET_FILTER_LIST_ENTRY_EXCEPTION:
          serviceImpl.setFilterListEntryException((patches.v1.FilterLists.SetFilterListEntryExceptionRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.FilterLists.SetFilterListEntryExceptionResponse>) responseObserver);
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
          getPublishFilterListMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.PublishFilterListRequest,
              patches.v1.FilterLists.PublishFilterListResponse>(
                service, METHODID_PUBLISH_FILTER_LIST)))
        .addMethod(
          getUpdateFilterListMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.UpdateFilterListRequest,
              patches.v1.FilterLists.UpdateFilterListResponse>(
                service, METHODID_UPDATE_FILTER_LIST)))
        .addMethod(
          getDeleteFilterListMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.DeleteFilterListRequest,
              patches.v1.FilterLists.DeleteFilterListResponse>(
                service, METHODID_DELETE_FILTER_LIST)))
        .addMethod(
          getGetFilterListMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.GetFilterListRequest,
              patches.v1.FilterLists.GetFilterListResponse>(
                service, METHODID_GET_FILTER_LIST)))
        .addMethod(
          getListFilterListsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.ListFilterListsRequest,
              patches.v1.FilterLists.ListFilterListsResponse>(
                service, METHODID_LIST_FILTER_LISTS)))
        .addMethod(
          getListFilterListEntriesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.ListFilterListEntriesRequest,
              patches.v1.FilterLists.ListFilterListEntriesResponse>(
                service, METHODID_LIST_FILTER_LIST_ENTRIES)))
        .addMethod(
          getSubscribeFilterListMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.SubscribeFilterListRequest,
              patches.v1.FilterLists.SubscribeFilterListResponse>(
                service, METHODID_SUBSCRIBE_FILTER_LIST)))
        .addMethod(
          getUnsubscribeFilterListMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.UnsubscribeFilterListRequest,
              patches.v1.FilterLists.UnsubscribeFilterListResponse>(
                service, METHODID_UNSUBSCRIBE_FILTER_LIST)))
        .addMethod(
          getListFilterListSubscriptionsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.ListFilterListSubscriptionsRequest,
              patches.v1.FilterLists.ListFilterListSubscriptionsResponse>(
                service, METHODID_LIST_FILTER_LIST_SUBSCRIPTIONS)))
        .addMethod(
          getSetFilterListEntryExceptionMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.FilterLists.SetFilterListEntryExceptionRequest,
              patches.v1.FilterLists.SetFilterListEntryExceptionResponse>(
                service, METHODID_SET_FILTER_LIST_ENTRY_EXCEPTION)))
        .build();
  }

  private static abstract class FilterListServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    FilterListServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.FilterLists.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("FilterListService");
    }
  }

  private static final class FilterListServiceFileDescriptorSupplier
      extends FilterListServiceBaseDescriptorSupplier {
    FilterListServiceFileDescriptorSupplier() {}
  }

  private static final class FilterListServiceMethodDescriptorSupplier
      extends FilterListServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    FilterListServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (FilterListServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new FilterListServiceFileDescriptorSupplier())
              .addMethod(getPublishFilterListMethod())
              .addMethod(getUpdateFilterListMethod())
              .addMethod(getDeleteFilterListMethod())
              .addMethod(getGetFilterListMethod())
              .addMethod(getListFilterListsMethod())
              .addMethod(getListFilterListEntriesMethod())
              .addMethod(getSubscribeFilterListMethod())
              .addMethod(getUnsubscribeFilterListMethod())
              .addMethod(getListFilterListSubscriptionsMethod())
              .addMethod(getSetFilterListEntryExceptionMethod())
              .build();
        }
      }
    }
    return result;
  }
}
