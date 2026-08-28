package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Patches Pages (spec §170-172, §176 Phase 4.5). The server stores, validates, versions and
 * serves a portable declarative document; it never renders (`docs/architecture/pages.md`).
 * `document` bytes on the wire are the canonical JSON serialization of a `packages/domain`
 * `PatchesPage` (`packages/domain`'s `serializePage`) — strictly validated on write
 * (`UpdatePage`), leniently re-read on the way back out (`GetPage`) so a page written by a
 * newer schema version never fails to load on an older server.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/pages.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class PageServiceGrpc {

  private PageServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.PageService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Pages.GetPageRequest,
      patches.v1.Pages.GetPageResponse> getGetPageMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetPage",
      requestType = patches.v1.Pages.GetPageRequest.class,
      responseType = patches.v1.Pages.GetPageResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Pages.GetPageRequest,
      patches.v1.Pages.GetPageResponse> getGetPageMethod() {
    io.grpc.MethodDescriptor<patches.v1.Pages.GetPageRequest, patches.v1.Pages.GetPageResponse> getGetPageMethod;
    if ((getGetPageMethod = PageServiceGrpc.getGetPageMethod) == null) {
      synchronized (PageServiceGrpc.class) {
        if ((getGetPageMethod = PageServiceGrpc.getGetPageMethod) == null) {
          PageServiceGrpc.getGetPageMethod = getGetPageMethod =
              io.grpc.MethodDescriptor.<patches.v1.Pages.GetPageRequest, patches.v1.Pages.GetPageResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetPage"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.GetPageRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.GetPageResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PageServiceMethodDescriptorSupplier("GetPage"))
              .build();
        }
      }
    }
    return getGetPageMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Pages.UpdatePageRequest,
      patches.v1.Pages.UpdatePageResponse> getUpdatePageMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UpdatePage",
      requestType = patches.v1.Pages.UpdatePageRequest.class,
      responseType = patches.v1.Pages.UpdatePageResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Pages.UpdatePageRequest,
      patches.v1.Pages.UpdatePageResponse> getUpdatePageMethod() {
    io.grpc.MethodDescriptor<patches.v1.Pages.UpdatePageRequest, patches.v1.Pages.UpdatePageResponse> getUpdatePageMethod;
    if ((getUpdatePageMethod = PageServiceGrpc.getUpdatePageMethod) == null) {
      synchronized (PageServiceGrpc.class) {
        if ((getUpdatePageMethod = PageServiceGrpc.getUpdatePageMethod) == null) {
          PageServiceGrpc.getUpdatePageMethod = getUpdatePageMethod =
              io.grpc.MethodDescriptor.<patches.v1.Pages.UpdatePageRequest, patches.v1.Pages.UpdatePageResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UpdatePage"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.UpdatePageRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.UpdatePageResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PageServiceMethodDescriptorSupplier("UpdatePage"))
              .build();
        }
      }
    }
    return getUpdatePageMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Pages.ListPageRevisionsRequest,
      patches.v1.Pages.ListPageRevisionsResponse> getListPageRevisionsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListPageRevisions",
      requestType = patches.v1.Pages.ListPageRevisionsRequest.class,
      responseType = patches.v1.Pages.ListPageRevisionsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Pages.ListPageRevisionsRequest,
      patches.v1.Pages.ListPageRevisionsResponse> getListPageRevisionsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Pages.ListPageRevisionsRequest, patches.v1.Pages.ListPageRevisionsResponse> getListPageRevisionsMethod;
    if ((getListPageRevisionsMethod = PageServiceGrpc.getListPageRevisionsMethod) == null) {
      synchronized (PageServiceGrpc.class) {
        if ((getListPageRevisionsMethod = PageServiceGrpc.getListPageRevisionsMethod) == null) {
          PageServiceGrpc.getListPageRevisionsMethod = getListPageRevisionsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Pages.ListPageRevisionsRequest, patches.v1.Pages.ListPageRevisionsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListPageRevisions"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.ListPageRevisionsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.ListPageRevisionsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PageServiceMethodDescriptorSupplier("ListPageRevisions"))
              .build();
        }
      }
    }
    return getListPageRevisionsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Pages.ListGuestbookRequest,
      patches.v1.Pages.ListGuestbookResponse> getListGuestbookMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListGuestbook",
      requestType = patches.v1.Pages.ListGuestbookRequest.class,
      responseType = patches.v1.Pages.ListGuestbookResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Pages.ListGuestbookRequest,
      patches.v1.Pages.ListGuestbookResponse> getListGuestbookMethod() {
    io.grpc.MethodDescriptor<patches.v1.Pages.ListGuestbookRequest, patches.v1.Pages.ListGuestbookResponse> getListGuestbookMethod;
    if ((getListGuestbookMethod = PageServiceGrpc.getListGuestbookMethod) == null) {
      synchronized (PageServiceGrpc.class) {
        if ((getListGuestbookMethod = PageServiceGrpc.getListGuestbookMethod) == null) {
          PageServiceGrpc.getListGuestbookMethod = getListGuestbookMethod =
              io.grpc.MethodDescriptor.<patches.v1.Pages.ListGuestbookRequest, patches.v1.Pages.ListGuestbookResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListGuestbook"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.ListGuestbookRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.ListGuestbookResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PageServiceMethodDescriptorSupplier("ListGuestbook"))
              .build();
        }
      }
    }
    return getListGuestbookMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Pages.SignGuestbookRequest,
      patches.v1.Pages.SignGuestbookResponse> getSignGuestbookMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SignGuestbook",
      requestType = patches.v1.Pages.SignGuestbookRequest.class,
      responseType = patches.v1.Pages.SignGuestbookResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Pages.SignGuestbookRequest,
      patches.v1.Pages.SignGuestbookResponse> getSignGuestbookMethod() {
    io.grpc.MethodDescriptor<patches.v1.Pages.SignGuestbookRequest, patches.v1.Pages.SignGuestbookResponse> getSignGuestbookMethod;
    if ((getSignGuestbookMethod = PageServiceGrpc.getSignGuestbookMethod) == null) {
      synchronized (PageServiceGrpc.class) {
        if ((getSignGuestbookMethod = PageServiceGrpc.getSignGuestbookMethod) == null) {
          PageServiceGrpc.getSignGuestbookMethod = getSignGuestbookMethod =
              io.grpc.MethodDescriptor.<patches.v1.Pages.SignGuestbookRequest, patches.v1.Pages.SignGuestbookResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SignGuestbook"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.SignGuestbookRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.SignGuestbookResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PageServiceMethodDescriptorSupplier("SignGuestbook"))
              .build();
        }
      }
    }
    return getSignGuestbookMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Pages.RemoveGuestbookEntryRequest,
      patches.v1.Pages.RemoveGuestbookEntryResponse> getRemoveGuestbookEntryMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RemoveGuestbookEntry",
      requestType = patches.v1.Pages.RemoveGuestbookEntryRequest.class,
      responseType = patches.v1.Pages.RemoveGuestbookEntryResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Pages.RemoveGuestbookEntryRequest,
      patches.v1.Pages.RemoveGuestbookEntryResponse> getRemoveGuestbookEntryMethod() {
    io.grpc.MethodDescriptor<patches.v1.Pages.RemoveGuestbookEntryRequest, patches.v1.Pages.RemoveGuestbookEntryResponse> getRemoveGuestbookEntryMethod;
    if ((getRemoveGuestbookEntryMethod = PageServiceGrpc.getRemoveGuestbookEntryMethod) == null) {
      synchronized (PageServiceGrpc.class) {
        if ((getRemoveGuestbookEntryMethod = PageServiceGrpc.getRemoveGuestbookEntryMethod) == null) {
          PageServiceGrpc.getRemoveGuestbookEntryMethod = getRemoveGuestbookEntryMethod =
              io.grpc.MethodDescriptor.<patches.v1.Pages.RemoveGuestbookEntryRequest, patches.v1.Pages.RemoveGuestbookEntryResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RemoveGuestbookEntry"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.RemoveGuestbookEntryRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.RemoveGuestbookEntryResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PageServiceMethodDescriptorSupplier("RemoveGuestbookEntry"))
              .build();
        }
      }
    }
    return getRemoveGuestbookEntryMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Pages.ReportGuestbookEntryRequest,
      patches.v1.Pages.ReportGuestbookEntryResponse> getReportGuestbookEntryMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ReportGuestbookEntry",
      requestType = patches.v1.Pages.ReportGuestbookEntryRequest.class,
      responseType = patches.v1.Pages.ReportGuestbookEntryResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Pages.ReportGuestbookEntryRequest,
      patches.v1.Pages.ReportGuestbookEntryResponse> getReportGuestbookEntryMethod() {
    io.grpc.MethodDescriptor<patches.v1.Pages.ReportGuestbookEntryRequest, patches.v1.Pages.ReportGuestbookEntryResponse> getReportGuestbookEntryMethod;
    if ((getReportGuestbookEntryMethod = PageServiceGrpc.getReportGuestbookEntryMethod) == null) {
      synchronized (PageServiceGrpc.class) {
        if ((getReportGuestbookEntryMethod = PageServiceGrpc.getReportGuestbookEntryMethod) == null) {
          PageServiceGrpc.getReportGuestbookEntryMethod = getReportGuestbookEntryMethod =
              io.grpc.MethodDescriptor.<patches.v1.Pages.ReportGuestbookEntryRequest, patches.v1.Pages.ReportGuestbookEntryResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ReportGuestbookEntry"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.ReportGuestbookEntryRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Pages.ReportGuestbookEntryResponse.getDefaultInstance()))
              .setSchemaDescriptor(new PageServiceMethodDescriptorSupplier("ReportGuestbookEntry"))
              .build();
        }
      }
    }
    return getReportGuestbookEntryMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static PageServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PageServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PageServiceStub>() {
        @java.lang.Override
        public PageServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PageServiceStub(channel, callOptions);
        }
      };
    return PageServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static PageServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PageServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PageServiceBlockingV2Stub>() {
        @java.lang.Override
        public PageServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PageServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return PageServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static PageServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PageServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PageServiceBlockingStub>() {
        @java.lang.Override
        public PageServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PageServiceBlockingStub(channel, callOptions);
        }
      };
    return PageServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static PageServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<PageServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<PageServiceFutureStub>() {
        @java.lang.Override
        public PageServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new PageServiceFutureStub(channel, callOptions);
        }
      };
    return PageServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Patches Pages (spec §170-172, §176 Phase 4.5). The server stores, validates, versions and
   * serves a portable declarative document; it never renders (`docs/architecture/pages.md`).
   * `document` bytes on the wire are the canonical JSON serialization of a `packages/domain`
   * `PatchesPage` (`packages/domain`'s `serializePage`) — strictly validated on write
   * (`UpdatePage`), leniently re-read on the way back out (`GetPage`) so a page written by a
   * newer schema version never fails to load on an older server.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * By owner handle + optional sub-page slug (empty = "index"). Anonymous-callable, and
     * block-aware like `PostService.GetPost` — a blocked-either-direction viewer gets a
     * uniform NOT_FOUND (spec §62), never PERMISSION_DENIED.
     * </pre>
     */
    default void getPage(patches.v1.Pages.GetPageRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.GetPageResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetPageMethod(), responseObserver);
    }

    /**
     * <pre>
     * Whole-document replace by the page's owner. Validated strictly against the document's
     * declared `version` (spec §171); writes a new immutable `page_revisions` row rather than
     * mutating one in place — "a bad edit is recoverable and moderation has an audit trail."
     * </pre>
     */
    default void updatePage(patches.v1.Pages.UpdatePageRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.UpdatePageResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUpdatePageMethod(), responseObserver);
    }

    /**
     * <pre>
     * The caller's own page's revision history, most-recent first. Owner only.
     * </pre>
     */
    default void listPageRevisions(patches.v1.Pages.ListPageRevisionsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.ListPageRevisionsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListPageRevisionsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Guestbook entries for a page, most-recent first. Anonymous-callable, block-aware like
     * `GetPage`.
     * </pre>
     */
    default void listGuestbook(patches.v1.Pages.ListGuestbookRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.ListGuestbookResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListGuestbookMethod(), responseObserver);
    }

    /**
     * <pre>
     * Rate-limited (spec §102) and block-aware: a blocked-either-direction caller cannot sign
     * (spec §62, §172). Requires an authenticated session — there is no anonymous guestbook
     * signature.
     * </pre>
     */
    default void signGuestbook(patches.v1.Pages.SignGuestbookRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.SignGuestbookResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSignGuestbookMethod(), responseObserver);
    }

    /**
     * <pre>
     * Removable by the page's owner (moderator removal is a documented follow-up — see
     * `docs/architecture/pages.md`). Idempotent: removing an already-removed entry is not an
     * error.
     * </pre>
     */
    default void removeGuestbookEntry(patches.v1.Pages.RemoveGuestbookEntryRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.RemoveGuestbookEntryResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRemoveGuestbookEntryMethod(), responseObserver);
    }

    /**
     * <pre>
     * Bounded report of a guestbook entry (spec §64, §172). `ModerationService` (moderation
     * .proto) has no guestbook-entry subject type — its `ReportReason`/subject-type surface
     * covers only ACTOR and POST — so this lives on `PageService` rather than growing
     * `ModerationService`'s scope outside this task's owned files; it reuses
     * `ModerationService`'s `ReportReason` enum rather than defining a second one.
     * </pre>
     */
    default void reportGuestbookEntry(patches.v1.Pages.ReportGuestbookEntryRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.ReportGuestbookEntryResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getReportGuestbookEntryMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service PageService.
   * <pre>
   * Patches Pages (spec §170-172, §176 Phase 4.5). The server stores, validates, versions and
   * serves a portable declarative document; it never renders (`docs/architecture/pages.md`).
   * `document` bytes on the wire are the canonical JSON serialization of a `packages/domain`
   * `PatchesPage` (`packages/domain`'s `serializePage`) — strictly validated on write
   * (`UpdatePage`), leniently re-read on the way back out (`GetPage`) so a page written by a
   * newer schema version never fails to load on an older server.
   * </pre>
   */
  public static abstract class PageServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return PageServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service PageService.
   * <pre>
   * Patches Pages (spec §170-172, §176 Phase 4.5). The server stores, validates, versions and
   * serves a portable declarative document; it never renders (`docs/architecture/pages.md`).
   * `document` bytes on the wire are the canonical JSON serialization of a `packages/domain`
   * `PatchesPage` (`packages/domain`'s `serializePage`) — strictly validated on write
   * (`UpdatePage`), leniently re-read on the way back out (`GetPage`) so a page written by a
   * newer schema version never fails to load on an older server.
   * </pre>
   */
  public static final class PageServiceStub
      extends io.grpc.stub.AbstractAsyncStub<PageServiceStub> {
    private PageServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PageServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PageServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * By owner handle + optional sub-page slug (empty = "index"). Anonymous-callable, and
     * block-aware like `PostService.GetPost` — a blocked-either-direction viewer gets a
     * uniform NOT_FOUND (spec §62), never PERMISSION_DENIED.
     * </pre>
     */
    public void getPage(patches.v1.Pages.GetPageRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.GetPageResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetPageMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Whole-document replace by the page's owner. Validated strictly against the document's
     * declared `version` (spec §171); writes a new immutable `page_revisions` row rather than
     * mutating one in place — "a bad edit is recoverable and moderation has an audit trail."
     * </pre>
     */
    public void updatePage(patches.v1.Pages.UpdatePageRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.UpdatePageResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUpdatePageMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The caller's own page's revision history, most-recent first. Owner only.
     * </pre>
     */
    public void listPageRevisions(patches.v1.Pages.ListPageRevisionsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.ListPageRevisionsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListPageRevisionsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Guestbook entries for a page, most-recent first. Anonymous-callable, block-aware like
     * `GetPage`.
     * </pre>
     */
    public void listGuestbook(patches.v1.Pages.ListGuestbookRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.ListGuestbookResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListGuestbookMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Rate-limited (spec §102) and block-aware: a blocked-either-direction caller cannot sign
     * (spec §62, §172). Requires an authenticated session — there is no anonymous guestbook
     * signature.
     * </pre>
     */
    public void signGuestbook(patches.v1.Pages.SignGuestbookRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.SignGuestbookResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSignGuestbookMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Removable by the page's owner (moderator removal is a documented follow-up — see
     * `docs/architecture/pages.md`). Idempotent: removing an already-removed entry is not an
     * error.
     * </pre>
     */
    public void removeGuestbookEntry(patches.v1.Pages.RemoveGuestbookEntryRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.RemoveGuestbookEntryResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRemoveGuestbookEntryMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Bounded report of a guestbook entry (spec §64, §172). `ModerationService` (moderation
     * .proto) has no guestbook-entry subject type — its `ReportReason`/subject-type surface
     * covers only ACTOR and POST — so this lives on `PageService` rather than growing
     * `ModerationService`'s scope outside this task's owned files; it reuses
     * `ModerationService`'s `ReportReason` enum rather than defining a second one.
     * </pre>
     */
    public void reportGuestbookEntry(patches.v1.Pages.ReportGuestbookEntryRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Pages.ReportGuestbookEntryResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getReportGuestbookEntryMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service PageService.
   * <pre>
   * Patches Pages (spec §170-172, §176 Phase 4.5). The server stores, validates, versions and
   * serves a portable declarative document; it never renders (`docs/architecture/pages.md`).
   * `document` bytes on the wire are the canonical JSON serialization of a `packages/domain`
   * `PatchesPage` (`packages/domain`'s `serializePage`) — strictly validated on write
   * (`UpdatePage`), leniently re-read on the way back out (`GetPage`) so a page written by a
   * newer schema version never fails to load on an older server.
   * </pre>
   */
  public static final class PageServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<PageServiceBlockingV2Stub> {
    private PageServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PageServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PageServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * By owner handle + optional sub-page slug (empty = "index"). Anonymous-callable, and
     * block-aware like `PostService.GetPost` — a blocked-either-direction viewer gets a
     * uniform NOT_FOUND (spec §62), never PERMISSION_DENIED.
     * </pre>
     */
    public patches.v1.Pages.GetPageResponse getPage(patches.v1.Pages.GetPageRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPageMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Whole-document replace by the page's owner. Validated strictly against the document's
     * declared `version` (spec §171); writes a new immutable `page_revisions` row rather than
     * mutating one in place — "a bad edit is recoverable and moderation has an audit trail."
     * </pre>
     */
    public patches.v1.Pages.UpdatePageResponse updatePage(patches.v1.Pages.UpdatePageRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdatePageMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own page's revision history, most-recent first. Owner only.
     * </pre>
     */
    public patches.v1.Pages.ListPageRevisionsResponse listPageRevisions(patches.v1.Pages.ListPageRevisionsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPageRevisionsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Guestbook entries for a page, most-recent first. Anonymous-callable, block-aware like
     * `GetPage`.
     * </pre>
     */
    public patches.v1.Pages.ListGuestbookResponse listGuestbook(patches.v1.Pages.ListGuestbookRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListGuestbookMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rate-limited (spec §102) and block-aware: a blocked-either-direction caller cannot sign
     * (spec §62, §172). Requires an authenticated session — there is no anonymous guestbook
     * signature.
     * </pre>
     */
    public patches.v1.Pages.SignGuestbookResponse signGuestbook(patches.v1.Pages.SignGuestbookRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSignGuestbookMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Removable by the page's owner (moderator removal is a documented follow-up — see
     * `docs/architecture/pages.md`). Idempotent: removing an already-removed entry is not an
     * error.
     * </pre>
     */
    public patches.v1.Pages.RemoveGuestbookEntryResponse removeGuestbookEntry(patches.v1.Pages.RemoveGuestbookEntryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRemoveGuestbookEntryMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Bounded report of a guestbook entry (spec §64, §172). `ModerationService` (moderation
     * .proto) has no guestbook-entry subject type — its `ReportReason`/subject-type surface
     * covers only ACTOR and POST — so this lives on `PageService` rather than growing
     * `ModerationService`'s scope outside this task's owned files; it reuses
     * `ModerationService`'s `ReportReason` enum rather than defining a second one.
     * </pre>
     */
    public patches.v1.Pages.ReportGuestbookEntryResponse reportGuestbookEntry(patches.v1.Pages.ReportGuestbookEntryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportGuestbookEntryMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service PageService.
   * <pre>
   * Patches Pages (spec §170-172, §176 Phase 4.5). The server stores, validates, versions and
   * serves a portable declarative document; it never renders (`docs/architecture/pages.md`).
   * `document` bytes on the wire are the canonical JSON serialization of a `packages/domain`
   * `PatchesPage` (`packages/domain`'s `serializePage`) — strictly validated on write
   * (`UpdatePage`), leniently re-read on the way back out (`GetPage`) so a page written by a
   * newer schema version never fails to load on an older server.
   * </pre>
   */
  public static final class PageServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<PageServiceBlockingStub> {
    private PageServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PageServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PageServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * By owner handle + optional sub-page slug (empty = "index"). Anonymous-callable, and
     * block-aware like `PostService.GetPost` — a blocked-either-direction viewer gets a
     * uniform NOT_FOUND (spec §62), never PERMISSION_DENIED.
     * </pre>
     */
    public patches.v1.Pages.GetPageResponse getPage(patches.v1.Pages.GetPageRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPageMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Whole-document replace by the page's owner. Validated strictly against the document's
     * declared `version` (spec §171); writes a new immutable `page_revisions` row rather than
     * mutating one in place — "a bad edit is recoverable and moderation has an audit trail."
     * </pre>
     */
    public patches.v1.Pages.UpdatePageResponse updatePage(patches.v1.Pages.UpdatePageRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUpdatePageMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The caller's own page's revision history, most-recent first. Owner only.
     * </pre>
     */
    public patches.v1.Pages.ListPageRevisionsResponse listPageRevisions(patches.v1.Pages.ListPageRevisionsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListPageRevisionsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Guestbook entries for a page, most-recent first. Anonymous-callable, block-aware like
     * `GetPage`.
     * </pre>
     */
    public patches.v1.Pages.ListGuestbookResponse listGuestbook(patches.v1.Pages.ListGuestbookRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListGuestbookMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rate-limited (spec §102) and block-aware: a blocked-either-direction caller cannot sign
     * (spec §62, §172). Requires an authenticated session — there is no anonymous guestbook
     * signature.
     * </pre>
     */
    public patches.v1.Pages.SignGuestbookResponse signGuestbook(patches.v1.Pages.SignGuestbookRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSignGuestbookMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Removable by the page's owner (moderator removal is a documented follow-up — see
     * `docs/architecture/pages.md`). Idempotent: removing an already-removed entry is not an
     * error.
     * </pre>
     */
    public patches.v1.Pages.RemoveGuestbookEntryResponse removeGuestbookEntry(patches.v1.Pages.RemoveGuestbookEntryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRemoveGuestbookEntryMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Bounded report of a guestbook entry (spec §64, §172). `ModerationService` (moderation
     * .proto) has no guestbook-entry subject type — its `ReportReason`/subject-type surface
     * covers only ACTOR and POST — so this lives on `PageService` rather than growing
     * `ModerationService`'s scope outside this task's owned files; it reuses
     * `ModerationService`'s `ReportReason` enum rather than defining a second one.
     * </pre>
     */
    public patches.v1.Pages.ReportGuestbookEntryResponse reportGuestbookEntry(patches.v1.Pages.ReportGuestbookEntryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getReportGuestbookEntryMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service PageService.
   * <pre>
   * Patches Pages (spec §170-172, §176 Phase 4.5). The server stores, validates, versions and
   * serves a portable declarative document; it never renders (`docs/architecture/pages.md`).
   * `document` bytes on the wire are the canonical JSON serialization of a `packages/domain`
   * `PatchesPage` (`packages/domain`'s `serializePage`) — strictly validated on write
   * (`UpdatePage`), leniently re-read on the way back out (`GetPage`) so a page written by a
   * newer schema version never fails to load on an older server.
   * </pre>
   */
  public static final class PageServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<PageServiceFutureStub> {
    private PageServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected PageServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new PageServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * By owner handle + optional sub-page slug (empty = "index"). Anonymous-callable, and
     * block-aware like `PostService.GetPost` — a blocked-either-direction viewer gets a
     * uniform NOT_FOUND (spec §62), never PERMISSION_DENIED.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Pages.GetPageResponse> getPage(
        patches.v1.Pages.GetPageRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetPageMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Whole-document replace by the page's owner. Validated strictly against the document's
     * declared `version` (spec §171); writes a new immutable `page_revisions` row rather than
     * mutating one in place — "a bad edit is recoverable and moderation has an audit trail."
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Pages.UpdatePageResponse> updatePage(
        patches.v1.Pages.UpdatePageRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUpdatePageMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The caller's own page's revision history, most-recent first. Owner only.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Pages.ListPageRevisionsResponse> listPageRevisions(
        patches.v1.Pages.ListPageRevisionsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListPageRevisionsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Guestbook entries for a page, most-recent first. Anonymous-callable, block-aware like
     * `GetPage`.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Pages.ListGuestbookResponse> listGuestbook(
        patches.v1.Pages.ListGuestbookRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListGuestbookMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Rate-limited (spec §102) and block-aware: a blocked-either-direction caller cannot sign
     * (spec §62, §172). Requires an authenticated session — there is no anonymous guestbook
     * signature.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Pages.SignGuestbookResponse> signGuestbook(
        patches.v1.Pages.SignGuestbookRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSignGuestbookMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Removable by the page's owner (moderator removal is a documented follow-up — see
     * `docs/architecture/pages.md`). Idempotent: removing an already-removed entry is not an
     * error.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Pages.RemoveGuestbookEntryResponse> removeGuestbookEntry(
        patches.v1.Pages.RemoveGuestbookEntryRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRemoveGuestbookEntryMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Bounded report of a guestbook entry (spec §64, §172). `ModerationService` (moderation
     * .proto) has no guestbook-entry subject type — its `ReportReason`/subject-type surface
     * covers only ACTOR and POST — so this lives on `PageService` rather than growing
     * `ModerationService`'s scope outside this task's owned files; it reuses
     * `ModerationService`'s `ReportReason` enum rather than defining a second one.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Pages.ReportGuestbookEntryResponse> reportGuestbookEntry(
        patches.v1.Pages.ReportGuestbookEntryRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getReportGuestbookEntryMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_GET_PAGE = 0;
  private static final int METHODID_UPDATE_PAGE = 1;
  private static final int METHODID_LIST_PAGE_REVISIONS = 2;
  private static final int METHODID_LIST_GUESTBOOK = 3;
  private static final int METHODID_SIGN_GUESTBOOK = 4;
  private static final int METHODID_REMOVE_GUESTBOOK_ENTRY = 5;
  private static final int METHODID_REPORT_GUESTBOOK_ENTRY = 6;

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
        case METHODID_GET_PAGE:
          serviceImpl.getPage((patches.v1.Pages.GetPageRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Pages.GetPageResponse>) responseObserver);
          break;
        case METHODID_UPDATE_PAGE:
          serviceImpl.updatePage((patches.v1.Pages.UpdatePageRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Pages.UpdatePageResponse>) responseObserver);
          break;
        case METHODID_LIST_PAGE_REVISIONS:
          serviceImpl.listPageRevisions((patches.v1.Pages.ListPageRevisionsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Pages.ListPageRevisionsResponse>) responseObserver);
          break;
        case METHODID_LIST_GUESTBOOK:
          serviceImpl.listGuestbook((patches.v1.Pages.ListGuestbookRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Pages.ListGuestbookResponse>) responseObserver);
          break;
        case METHODID_SIGN_GUESTBOOK:
          serviceImpl.signGuestbook((patches.v1.Pages.SignGuestbookRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Pages.SignGuestbookResponse>) responseObserver);
          break;
        case METHODID_REMOVE_GUESTBOOK_ENTRY:
          serviceImpl.removeGuestbookEntry((patches.v1.Pages.RemoveGuestbookEntryRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Pages.RemoveGuestbookEntryResponse>) responseObserver);
          break;
        case METHODID_REPORT_GUESTBOOK_ENTRY:
          serviceImpl.reportGuestbookEntry((patches.v1.Pages.ReportGuestbookEntryRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Pages.ReportGuestbookEntryResponse>) responseObserver);
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
          getGetPageMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Pages.GetPageRequest,
              patches.v1.Pages.GetPageResponse>(
                service, METHODID_GET_PAGE)))
        .addMethod(
          getUpdatePageMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Pages.UpdatePageRequest,
              patches.v1.Pages.UpdatePageResponse>(
                service, METHODID_UPDATE_PAGE)))
        .addMethod(
          getListPageRevisionsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Pages.ListPageRevisionsRequest,
              patches.v1.Pages.ListPageRevisionsResponse>(
                service, METHODID_LIST_PAGE_REVISIONS)))
        .addMethod(
          getListGuestbookMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Pages.ListGuestbookRequest,
              patches.v1.Pages.ListGuestbookResponse>(
                service, METHODID_LIST_GUESTBOOK)))
        .addMethod(
          getSignGuestbookMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Pages.SignGuestbookRequest,
              patches.v1.Pages.SignGuestbookResponse>(
                service, METHODID_SIGN_GUESTBOOK)))
        .addMethod(
          getRemoveGuestbookEntryMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Pages.RemoveGuestbookEntryRequest,
              patches.v1.Pages.RemoveGuestbookEntryResponse>(
                service, METHODID_REMOVE_GUESTBOOK_ENTRY)))
        .addMethod(
          getReportGuestbookEntryMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Pages.ReportGuestbookEntryRequest,
              patches.v1.Pages.ReportGuestbookEntryResponse>(
                service, METHODID_REPORT_GUESTBOOK_ENTRY)))
        .build();
  }

  private static abstract class PageServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    PageServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Pages.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("PageService");
    }
  }

  private static final class PageServiceFileDescriptorSupplier
      extends PageServiceBaseDescriptorSupplier {
    PageServiceFileDescriptorSupplier() {}
  }

  private static final class PageServiceMethodDescriptorSupplier
      extends PageServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    PageServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (PageServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new PageServiceFileDescriptorSupplier())
              .addMethod(getGetPageMethod())
              .addMethod(getUpdatePageMethod())
              .addMethod(getListPageRevisionsMethod())
              .addMethod(getListGuestbookMethod())
              .addMethod(getSignGuestbookMethod())
              .addMethod(getRemoveGuestbookEntryMethod())
              .addMethod(getReportGuestbookEntryMethod())
              .build();
        }
      }
    }
    return result;
  }
}
