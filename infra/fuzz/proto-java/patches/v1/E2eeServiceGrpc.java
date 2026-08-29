package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * End-to-end encrypted direct messages (spec §183, §194, §195.1; ADR 0020).
 * The whole point of this service is a boundary, so it is stated once here and re-stated as an
 * invariant on every message below:
 *   * The node routes, authorizes, rate-limits, and retains **opaque bytes**. It never receives
 *     an E2EE message body, a message key, ratchet state, a device private key, or a recovery
 *     key. `E2eeReportEvidenceItem.disclosed_plaintext` is the single, deliberate exception in
 *     this entire schema — plaintext a reporter explicitly selected and submitted (ADR 0020 §9).
 *   * `E2EE_V1` is the only conversation security mode (ADR 0030, B-095 — the server-visible
 *     `LEGACY_SERVER_VISIBLE` mode this once coexisted with is retired, its enum value
 *     reserved). It is immutable, fixed at creation: there is no RPC here — nor will there ever
 *     be one — that converts a conversation's mode after the fact.
 *   * An E2EE send never falls back to plaintext or to a server-held key. When a device, a
 *     prekey, or the capability is unavailable, the send **fails** (ADR 0020 §1.2).
 *   * Only an `E2EE_V1` conversation may be described to a user as encrypted or end-to-end.
 *     Spec §194 forbids that word for every other conversation, absolutely and without a
 *     "mostly"/"soon" qualifier (see `docs/architecture/e2ee.md` §8 for the required copy).
 *   * Nothing here crosses `FederationGateway`. ADR 0020 §13 authorizes local-node E2EE only.
 * Pagination is keyset-only (spec §153). Every list RPC takes an opaque cursor and returns
 * `PageInfo`; no RPC in this file has an offset, a page number, a sort, or an order parameter.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/e2ee.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class E2eeServiceGrpc {

  private E2eeServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.E2eeService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.GetE2eeCapabilityRequest,
      patches.v1.E2Ee.GetE2eeCapabilityResponse> getGetE2eeCapabilityMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetE2eeCapability",
      requestType = patches.v1.E2Ee.GetE2eeCapabilityRequest.class,
      responseType = patches.v1.E2Ee.GetE2eeCapabilityResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.GetE2eeCapabilityRequest,
      patches.v1.E2Ee.GetE2eeCapabilityResponse> getGetE2eeCapabilityMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.GetE2eeCapabilityRequest, patches.v1.E2Ee.GetE2eeCapabilityResponse> getGetE2eeCapabilityMethod;
    if ((getGetE2eeCapabilityMethod = E2eeServiceGrpc.getGetE2eeCapabilityMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getGetE2eeCapabilityMethod = E2eeServiceGrpc.getGetE2eeCapabilityMethod) == null) {
          E2eeServiceGrpc.getGetE2eeCapabilityMethod = getGetE2eeCapabilityMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.GetE2eeCapabilityRequest, patches.v1.E2Ee.GetE2eeCapabilityResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetE2eeCapability"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetE2eeCapabilityRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetE2eeCapabilityResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("GetE2eeCapability"))
              .build();
        }
      }
    }
    return getGetE2eeCapabilityMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.PublishIdentityRootRequest,
      patches.v1.E2Ee.PublishIdentityRootResponse> getPublishIdentityRootMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PublishIdentityRoot",
      requestType = patches.v1.E2Ee.PublishIdentityRootRequest.class,
      responseType = patches.v1.E2Ee.PublishIdentityRootResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.PublishIdentityRootRequest,
      patches.v1.E2Ee.PublishIdentityRootResponse> getPublishIdentityRootMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.PublishIdentityRootRequest, patches.v1.E2Ee.PublishIdentityRootResponse> getPublishIdentityRootMethod;
    if ((getPublishIdentityRootMethod = E2eeServiceGrpc.getPublishIdentityRootMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getPublishIdentityRootMethod = E2eeServiceGrpc.getPublishIdentityRootMethod) == null) {
          E2eeServiceGrpc.getPublishIdentityRootMethod = getPublishIdentityRootMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.PublishIdentityRootRequest, patches.v1.E2Ee.PublishIdentityRootResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PublishIdentityRoot"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.PublishIdentityRootRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.PublishIdentityRootResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("PublishIdentityRoot"))
              .build();
        }
      }
    }
    return getPublishIdentityRootMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.GetIdentityRootRequest,
      patches.v1.E2Ee.GetIdentityRootResponse> getGetIdentityRootMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetIdentityRoot",
      requestType = patches.v1.E2Ee.GetIdentityRootRequest.class,
      responseType = patches.v1.E2Ee.GetIdentityRootResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.GetIdentityRootRequest,
      patches.v1.E2Ee.GetIdentityRootResponse> getGetIdentityRootMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.GetIdentityRootRequest, patches.v1.E2Ee.GetIdentityRootResponse> getGetIdentityRootMethod;
    if ((getGetIdentityRootMethod = E2eeServiceGrpc.getGetIdentityRootMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getGetIdentityRootMethod = E2eeServiceGrpc.getGetIdentityRootMethod) == null) {
          E2eeServiceGrpc.getGetIdentityRootMethod = getGetIdentityRootMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.GetIdentityRootRequest, patches.v1.E2Ee.GetIdentityRootResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetIdentityRoot"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetIdentityRootRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetIdentityRootResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("GetIdentityRoot"))
              .build();
        }
      }
    }
    return getGetIdentityRootMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.EnrollDeviceRequest,
      patches.v1.E2Ee.EnrollDeviceResponse> getEnrollDeviceMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "EnrollDevice",
      requestType = patches.v1.E2Ee.EnrollDeviceRequest.class,
      responseType = patches.v1.E2Ee.EnrollDeviceResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.EnrollDeviceRequest,
      patches.v1.E2Ee.EnrollDeviceResponse> getEnrollDeviceMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.EnrollDeviceRequest, patches.v1.E2Ee.EnrollDeviceResponse> getEnrollDeviceMethod;
    if ((getEnrollDeviceMethod = E2eeServiceGrpc.getEnrollDeviceMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getEnrollDeviceMethod = E2eeServiceGrpc.getEnrollDeviceMethod) == null) {
          E2eeServiceGrpc.getEnrollDeviceMethod = getEnrollDeviceMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.EnrollDeviceRequest, patches.v1.E2Ee.EnrollDeviceResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "EnrollDevice"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.EnrollDeviceRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.EnrollDeviceResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("EnrollDevice"))
              .build();
        }
      }
    }
    return getEnrollDeviceMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.RevokeDeviceRequest,
      patches.v1.E2Ee.RevokeDeviceResponse> getRevokeDeviceMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RevokeDevice",
      requestType = patches.v1.E2Ee.RevokeDeviceRequest.class,
      responseType = patches.v1.E2Ee.RevokeDeviceResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.RevokeDeviceRequest,
      patches.v1.E2Ee.RevokeDeviceResponse> getRevokeDeviceMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.RevokeDeviceRequest, patches.v1.E2Ee.RevokeDeviceResponse> getRevokeDeviceMethod;
    if ((getRevokeDeviceMethod = E2eeServiceGrpc.getRevokeDeviceMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getRevokeDeviceMethod = E2eeServiceGrpc.getRevokeDeviceMethod) == null) {
          E2eeServiceGrpc.getRevokeDeviceMethod = getRevokeDeviceMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.RevokeDeviceRequest, patches.v1.E2Ee.RevokeDeviceResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RevokeDevice"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.RevokeDeviceRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.RevokeDeviceResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("RevokeDevice"))
              .build();
        }
      }
    }
    return getRevokeDeviceMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.PublishDeviceRosterRequest,
      patches.v1.E2Ee.PublishDeviceRosterResponse> getPublishDeviceRosterMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PublishDeviceRoster",
      requestType = patches.v1.E2Ee.PublishDeviceRosterRequest.class,
      responseType = patches.v1.E2Ee.PublishDeviceRosterResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.PublishDeviceRosterRequest,
      patches.v1.E2Ee.PublishDeviceRosterResponse> getPublishDeviceRosterMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.PublishDeviceRosterRequest, patches.v1.E2Ee.PublishDeviceRosterResponse> getPublishDeviceRosterMethod;
    if ((getPublishDeviceRosterMethod = E2eeServiceGrpc.getPublishDeviceRosterMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getPublishDeviceRosterMethod = E2eeServiceGrpc.getPublishDeviceRosterMethod) == null) {
          E2eeServiceGrpc.getPublishDeviceRosterMethod = getPublishDeviceRosterMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.PublishDeviceRosterRequest, patches.v1.E2Ee.PublishDeviceRosterResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PublishDeviceRoster"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.PublishDeviceRosterRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.PublishDeviceRosterResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("PublishDeviceRoster"))
              .build();
        }
      }
    }
    return getPublishDeviceRosterMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.GetDeviceRosterRequest,
      patches.v1.E2Ee.GetDeviceRosterResponse> getGetDeviceRosterMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetDeviceRoster",
      requestType = patches.v1.E2Ee.GetDeviceRosterRequest.class,
      responseType = patches.v1.E2Ee.GetDeviceRosterResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.GetDeviceRosterRequest,
      patches.v1.E2Ee.GetDeviceRosterResponse> getGetDeviceRosterMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.GetDeviceRosterRequest, patches.v1.E2Ee.GetDeviceRosterResponse> getGetDeviceRosterMethod;
    if ((getGetDeviceRosterMethod = E2eeServiceGrpc.getGetDeviceRosterMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getGetDeviceRosterMethod = E2eeServiceGrpc.getGetDeviceRosterMethod) == null) {
          E2eeServiceGrpc.getGetDeviceRosterMethod = getGetDeviceRosterMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.GetDeviceRosterRequest, patches.v1.E2Ee.GetDeviceRosterResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetDeviceRoster"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetDeviceRosterRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetDeviceRosterResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("GetDeviceRoster"))
              .build();
        }
      }
    }
    return getGetDeviceRosterMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.ListDeviceRostersRequest,
      patches.v1.E2Ee.ListDeviceRostersResponse> getListDeviceRostersMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListDeviceRosters",
      requestType = patches.v1.E2Ee.ListDeviceRostersRequest.class,
      responseType = patches.v1.E2Ee.ListDeviceRostersResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.ListDeviceRostersRequest,
      patches.v1.E2Ee.ListDeviceRostersResponse> getListDeviceRostersMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.ListDeviceRostersRequest, patches.v1.E2Ee.ListDeviceRostersResponse> getListDeviceRostersMethod;
    if ((getListDeviceRostersMethod = E2eeServiceGrpc.getListDeviceRostersMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getListDeviceRostersMethod = E2eeServiceGrpc.getListDeviceRostersMethod) == null) {
          E2eeServiceGrpc.getListDeviceRostersMethod = getListDeviceRostersMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.ListDeviceRostersRequest, patches.v1.E2Ee.ListDeviceRostersResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListDeviceRosters"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ListDeviceRostersRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ListDeviceRostersResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("ListDeviceRosters"))
              .build();
        }
      }
    }
    return getListDeviceRostersMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.UploadPrekeysRequest,
      patches.v1.E2Ee.UploadPrekeysResponse> getUploadPrekeysMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "UploadPrekeys",
      requestType = patches.v1.E2Ee.UploadPrekeysRequest.class,
      responseType = patches.v1.E2Ee.UploadPrekeysResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.UploadPrekeysRequest,
      patches.v1.E2Ee.UploadPrekeysResponse> getUploadPrekeysMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.UploadPrekeysRequest, patches.v1.E2Ee.UploadPrekeysResponse> getUploadPrekeysMethod;
    if ((getUploadPrekeysMethod = E2eeServiceGrpc.getUploadPrekeysMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getUploadPrekeysMethod = E2eeServiceGrpc.getUploadPrekeysMethod) == null) {
          E2eeServiceGrpc.getUploadPrekeysMethod = getUploadPrekeysMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.UploadPrekeysRequest, patches.v1.E2Ee.UploadPrekeysResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "UploadPrekeys"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.UploadPrekeysRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.UploadPrekeysResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("UploadPrekeys"))
              .build();
        }
      }
    }
    return getUploadPrekeysMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.GetPrekeyInventoryRequest,
      patches.v1.E2Ee.GetPrekeyInventoryResponse> getGetPrekeyInventoryMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetPrekeyInventory",
      requestType = patches.v1.E2Ee.GetPrekeyInventoryRequest.class,
      responseType = patches.v1.E2Ee.GetPrekeyInventoryResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.GetPrekeyInventoryRequest,
      patches.v1.E2Ee.GetPrekeyInventoryResponse> getGetPrekeyInventoryMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.GetPrekeyInventoryRequest, patches.v1.E2Ee.GetPrekeyInventoryResponse> getGetPrekeyInventoryMethod;
    if ((getGetPrekeyInventoryMethod = E2eeServiceGrpc.getGetPrekeyInventoryMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getGetPrekeyInventoryMethod = E2eeServiceGrpc.getGetPrekeyInventoryMethod) == null) {
          E2eeServiceGrpc.getGetPrekeyInventoryMethod = getGetPrekeyInventoryMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.GetPrekeyInventoryRequest, patches.v1.E2Ee.GetPrekeyInventoryResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetPrekeyInventory"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetPrekeyInventoryRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetPrekeyInventoryResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("GetPrekeyInventory"))
              .build();
        }
      }
    }
    return getGetPrekeyInventoryMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.ClaimPrekeyBundlesRequest,
      patches.v1.E2Ee.ClaimPrekeyBundlesResponse> getClaimPrekeyBundlesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ClaimPrekeyBundles",
      requestType = patches.v1.E2Ee.ClaimPrekeyBundlesRequest.class,
      responseType = patches.v1.E2Ee.ClaimPrekeyBundlesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.ClaimPrekeyBundlesRequest,
      patches.v1.E2Ee.ClaimPrekeyBundlesResponse> getClaimPrekeyBundlesMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.ClaimPrekeyBundlesRequest, patches.v1.E2Ee.ClaimPrekeyBundlesResponse> getClaimPrekeyBundlesMethod;
    if ((getClaimPrekeyBundlesMethod = E2eeServiceGrpc.getClaimPrekeyBundlesMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getClaimPrekeyBundlesMethod = E2eeServiceGrpc.getClaimPrekeyBundlesMethod) == null) {
          E2eeServiceGrpc.getClaimPrekeyBundlesMethod = getClaimPrekeyBundlesMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.ClaimPrekeyBundlesRequest, patches.v1.E2Ee.ClaimPrekeyBundlesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ClaimPrekeyBundles"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ClaimPrekeyBundlesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ClaimPrekeyBundlesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("ClaimPrekeyBundles"))
              .build();
        }
      }
    }
    return getClaimPrekeyBundlesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.CreateE2eeConversationRequest,
      patches.v1.E2Ee.CreateE2eeConversationResponse> getCreateE2eeConversationMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CreateE2eeConversation",
      requestType = patches.v1.E2Ee.CreateE2eeConversationRequest.class,
      responseType = patches.v1.E2Ee.CreateE2eeConversationResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.CreateE2eeConversationRequest,
      patches.v1.E2Ee.CreateE2eeConversationResponse> getCreateE2eeConversationMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.CreateE2eeConversationRequest, patches.v1.E2Ee.CreateE2eeConversationResponse> getCreateE2eeConversationMethod;
    if ((getCreateE2eeConversationMethod = E2eeServiceGrpc.getCreateE2eeConversationMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getCreateE2eeConversationMethod = E2eeServiceGrpc.getCreateE2eeConversationMethod) == null) {
          E2eeServiceGrpc.getCreateE2eeConversationMethod = getCreateE2eeConversationMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.CreateE2eeConversationRequest, patches.v1.E2Ee.CreateE2eeConversationResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CreateE2eeConversation"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.CreateE2eeConversationRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.CreateE2eeConversationResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("CreateE2eeConversation"))
              .build();
        }
      }
    }
    return getCreateE2eeConversationMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.GetE2eeConversationStateRequest,
      patches.v1.E2Ee.GetE2eeConversationStateResponse> getGetE2eeConversationStateMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetE2eeConversationState",
      requestType = patches.v1.E2Ee.GetE2eeConversationStateRequest.class,
      responseType = patches.v1.E2Ee.GetE2eeConversationStateResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.GetE2eeConversationStateRequest,
      patches.v1.E2Ee.GetE2eeConversationStateResponse> getGetE2eeConversationStateMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.GetE2eeConversationStateRequest, patches.v1.E2Ee.GetE2eeConversationStateResponse> getGetE2eeConversationStateMethod;
    if ((getGetE2eeConversationStateMethod = E2eeServiceGrpc.getGetE2eeConversationStateMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getGetE2eeConversationStateMethod = E2eeServiceGrpc.getGetE2eeConversationStateMethod) == null) {
          E2eeServiceGrpc.getGetE2eeConversationStateMethod = getGetE2eeConversationStateMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.GetE2eeConversationStateRequest, patches.v1.E2Ee.GetE2eeConversationStateResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetE2eeConversationState"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetE2eeConversationStateRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.GetE2eeConversationStateResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("GetE2eeConversationState"))
              .build();
        }
      }
    }
    return getGetE2eeConversationStateMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.AddE2eeMemberRequest,
      patches.v1.E2Ee.AddE2eeMemberResponse> getAddE2eeMemberMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AddE2eeMember",
      requestType = patches.v1.E2Ee.AddE2eeMemberRequest.class,
      responseType = patches.v1.E2Ee.AddE2eeMemberResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.AddE2eeMemberRequest,
      patches.v1.E2Ee.AddE2eeMemberResponse> getAddE2eeMemberMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.AddE2eeMemberRequest, patches.v1.E2Ee.AddE2eeMemberResponse> getAddE2eeMemberMethod;
    if ((getAddE2eeMemberMethod = E2eeServiceGrpc.getAddE2eeMemberMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getAddE2eeMemberMethod = E2eeServiceGrpc.getAddE2eeMemberMethod) == null) {
          E2eeServiceGrpc.getAddE2eeMemberMethod = getAddE2eeMemberMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.AddE2eeMemberRequest, patches.v1.E2Ee.AddE2eeMemberResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AddE2eeMember"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.AddE2eeMemberRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.AddE2eeMemberResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("AddE2eeMember"))
              .build();
        }
      }
    }
    return getAddE2eeMemberMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.RemoveE2eeMemberRequest,
      patches.v1.E2Ee.RemoveE2eeMemberResponse> getRemoveE2eeMemberMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RemoveE2eeMember",
      requestType = patches.v1.E2Ee.RemoveE2eeMemberRequest.class,
      responseType = patches.v1.E2Ee.RemoveE2eeMemberResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.RemoveE2eeMemberRequest,
      patches.v1.E2Ee.RemoveE2eeMemberResponse> getRemoveE2eeMemberMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.RemoveE2eeMemberRequest, patches.v1.E2Ee.RemoveE2eeMemberResponse> getRemoveE2eeMemberMethod;
    if ((getRemoveE2eeMemberMethod = E2eeServiceGrpc.getRemoveE2eeMemberMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getRemoveE2eeMemberMethod = E2eeServiceGrpc.getRemoveE2eeMemberMethod) == null) {
          E2eeServiceGrpc.getRemoveE2eeMemberMethod = getRemoveE2eeMemberMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.RemoveE2eeMemberRequest, patches.v1.E2Ee.RemoveE2eeMemberResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RemoveE2eeMember"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.RemoveE2eeMemberRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.RemoveE2eeMemberResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("RemoveE2eeMember"))
              .build();
        }
      }
    }
    return getRemoveE2eeMemberMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.ListE2eeGroupControlEventsRequest,
      patches.v1.E2Ee.ListE2eeGroupControlEventsResponse> getListE2eeGroupControlEventsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListE2eeGroupControlEvents",
      requestType = patches.v1.E2Ee.ListE2eeGroupControlEventsRequest.class,
      responseType = patches.v1.E2Ee.ListE2eeGroupControlEventsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.ListE2eeGroupControlEventsRequest,
      patches.v1.E2Ee.ListE2eeGroupControlEventsResponse> getListE2eeGroupControlEventsMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.ListE2eeGroupControlEventsRequest, patches.v1.E2Ee.ListE2eeGroupControlEventsResponse> getListE2eeGroupControlEventsMethod;
    if ((getListE2eeGroupControlEventsMethod = E2eeServiceGrpc.getListE2eeGroupControlEventsMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getListE2eeGroupControlEventsMethod = E2eeServiceGrpc.getListE2eeGroupControlEventsMethod) == null) {
          E2eeServiceGrpc.getListE2eeGroupControlEventsMethod = getListE2eeGroupControlEventsMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.ListE2eeGroupControlEventsRequest, patches.v1.E2Ee.ListE2eeGroupControlEventsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListE2eeGroupControlEvents"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ListE2eeGroupControlEventsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ListE2eeGroupControlEventsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("ListE2eeGroupControlEvents"))
              .build();
        }
      }
    }
    return getListE2eeGroupControlEventsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.SendEnvelopesRequest,
      patches.v1.E2Ee.SendEnvelopesResponse> getSendEnvelopesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "SendEnvelopes",
      requestType = patches.v1.E2Ee.SendEnvelopesRequest.class,
      responseType = patches.v1.E2Ee.SendEnvelopesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.SendEnvelopesRequest,
      patches.v1.E2Ee.SendEnvelopesResponse> getSendEnvelopesMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.SendEnvelopesRequest, patches.v1.E2Ee.SendEnvelopesResponse> getSendEnvelopesMethod;
    if ((getSendEnvelopesMethod = E2eeServiceGrpc.getSendEnvelopesMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getSendEnvelopesMethod = E2eeServiceGrpc.getSendEnvelopesMethod) == null) {
          E2eeServiceGrpc.getSendEnvelopesMethod = getSendEnvelopesMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.SendEnvelopesRequest, patches.v1.E2Ee.SendEnvelopesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "SendEnvelopes"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.SendEnvelopesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.SendEnvelopesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("SendEnvelopes"))
              .build();
        }
      }
    }
    return getSendEnvelopesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.ListMailboxEnvelopesRequest,
      patches.v1.E2Ee.ListMailboxEnvelopesResponse> getListMailboxEnvelopesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListMailboxEnvelopes",
      requestType = patches.v1.E2Ee.ListMailboxEnvelopesRequest.class,
      responseType = patches.v1.E2Ee.ListMailboxEnvelopesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.ListMailboxEnvelopesRequest,
      patches.v1.E2Ee.ListMailboxEnvelopesResponse> getListMailboxEnvelopesMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.ListMailboxEnvelopesRequest, patches.v1.E2Ee.ListMailboxEnvelopesResponse> getListMailboxEnvelopesMethod;
    if ((getListMailboxEnvelopesMethod = E2eeServiceGrpc.getListMailboxEnvelopesMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getListMailboxEnvelopesMethod = E2eeServiceGrpc.getListMailboxEnvelopesMethod) == null) {
          E2eeServiceGrpc.getListMailboxEnvelopesMethod = getListMailboxEnvelopesMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.ListMailboxEnvelopesRequest, patches.v1.E2Ee.ListMailboxEnvelopesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListMailboxEnvelopes"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ListMailboxEnvelopesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.ListMailboxEnvelopesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("ListMailboxEnvelopes"))
              .build();
        }
      }
    }
    return getListMailboxEnvelopesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.AcknowledgeEnvelopesRequest,
      patches.v1.E2Ee.AcknowledgeEnvelopesResponse> getAcknowledgeEnvelopesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AcknowledgeEnvelopes",
      requestType = patches.v1.E2Ee.AcknowledgeEnvelopesRequest.class,
      responseType = patches.v1.E2Ee.AcknowledgeEnvelopesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.AcknowledgeEnvelopesRequest,
      patches.v1.E2Ee.AcknowledgeEnvelopesResponse> getAcknowledgeEnvelopesMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.AcknowledgeEnvelopesRequest, patches.v1.E2Ee.AcknowledgeEnvelopesResponse> getAcknowledgeEnvelopesMethod;
    if ((getAcknowledgeEnvelopesMethod = E2eeServiceGrpc.getAcknowledgeEnvelopesMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getAcknowledgeEnvelopesMethod = E2eeServiceGrpc.getAcknowledgeEnvelopesMethod) == null) {
          E2eeServiceGrpc.getAcknowledgeEnvelopesMethod = getAcknowledgeEnvelopesMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.AcknowledgeEnvelopesRequest, patches.v1.E2Ee.AcknowledgeEnvelopesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AcknowledgeEnvelopes"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.AcknowledgeEnvelopesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.AcknowledgeEnvelopesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("AcknowledgeEnvelopes"))
              .build();
        }
      }
    }
    return getAcknowledgeEnvelopesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.E2Ee.AttachReportEvidenceRequest,
      patches.v1.E2Ee.AttachReportEvidenceResponse> getAttachReportEvidenceMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AttachReportEvidence",
      requestType = patches.v1.E2Ee.AttachReportEvidenceRequest.class,
      responseType = patches.v1.E2Ee.AttachReportEvidenceResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.E2Ee.AttachReportEvidenceRequest,
      patches.v1.E2Ee.AttachReportEvidenceResponse> getAttachReportEvidenceMethod() {
    io.grpc.MethodDescriptor<patches.v1.E2Ee.AttachReportEvidenceRequest, patches.v1.E2Ee.AttachReportEvidenceResponse> getAttachReportEvidenceMethod;
    if ((getAttachReportEvidenceMethod = E2eeServiceGrpc.getAttachReportEvidenceMethod) == null) {
      synchronized (E2eeServiceGrpc.class) {
        if ((getAttachReportEvidenceMethod = E2eeServiceGrpc.getAttachReportEvidenceMethod) == null) {
          E2eeServiceGrpc.getAttachReportEvidenceMethod = getAttachReportEvidenceMethod =
              io.grpc.MethodDescriptor.<patches.v1.E2Ee.AttachReportEvidenceRequest, patches.v1.E2Ee.AttachReportEvidenceResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AttachReportEvidence"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.AttachReportEvidenceRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.E2Ee.AttachReportEvidenceResponse.getDefaultInstance()))
              .setSchemaDescriptor(new E2eeServiceMethodDescriptorSupplier("AttachReportEvidence"))
              .build();
        }
      }
    }
    return getAttachReportEvidenceMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static E2eeServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<E2eeServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<E2eeServiceStub>() {
        @java.lang.Override
        public E2eeServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new E2eeServiceStub(channel, callOptions);
        }
      };
    return E2eeServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static E2eeServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<E2eeServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<E2eeServiceBlockingV2Stub>() {
        @java.lang.Override
        public E2eeServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new E2eeServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return E2eeServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static E2eeServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<E2eeServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<E2eeServiceBlockingStub>() {
        @java.lang.Override
        public E2eeServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new E2eeServiceBlockingStub(channel, callOptions);
        }
      };
    return E2eeServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static E2eeServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<E2eeServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<E2eeServiceFutureStub>() {
        @java.lang.Override
        public E2eeServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new E2eeServiceFutureStub(channel, callOptions);
        }
      };
    return E2eeServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * End-to-end encrypted direct messages (spec §183, §194, §195.1; ADR 0020).
   * The whole point of this service is a boundary, so it is stated once here and re-stated as an
   * invariant on every message below:
   *   * The node routes, authorizes, rate-limits, and retains **opaque bytes**. It never receives
   *     an E2EE message body, a message key, ratchet state, a device private key, or a recovery
   *     key. `E2eeReportEvidenceItem.disclosed_plaintext` is the single, deliberate exception in
   *     this entire schema — plaintext a reporter explicitly selected and submitted (ADR 0020 §9).
   *   * `E2EE_V1` is the only conversation security mode (ADR 0030, B-095 — the server-visible
   *     `LEGACY_SERVER_VISIBLE` mode this once coexisted with is retired, its enum value
   *     reserved). It is immutable, fixed at creation: there is no RPC here — nor will there ever
   *     be one — that converts a conversation's mode after the fact.
   *   * An E2EE send never falls back to plaintext or to a server-held key. When a device, a
   *     prekey, or the capability is unavailable, the send **fails** (ADR 0020 §1.2).
   *   * Only an `E2EE_V1` conversation may be described to a user as encrypted or end-to-end.
   *     Spec §194 forbids that word for every other conversation, absolutely and without a
   *     "mostly"/"soon" qualifier (see `docs/architecture/e2ee.md` §8 for the required copy).
   *   * Nothing here crosses `FederationGateway`. ADR 0020 §13 authorizes local-node E2EE only.
   * Pagination is keyset-only (spec §153). Every list RPC takes an opaque cursor and returns
   * `PageInfo`; no RPC in this file has an offset, a page number, a sort, or an order parameter.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * What this node supports and whether it is switched on. Callable before enrollment, because
     * a client must be able to discover that E2EE is unavailable *before* it offers the option.
     * </pre>
     */
    default void getE2eeCapability(patches.v1.E2Ee.GetE2eeCapabilityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetE2eeCapabilityResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetE2eeCapabilityMethod(), responseObserver);
    }

    /**
     * <pre>
     * Publishes the caller's messaging identity root, or rotates it to a new generation. A
     * rotation is a hard identity change for every contact (ADR 0020 §3) — the node stores and
     * serves it, and never certifies it.
     * </pre>
     */
    default void publishIdentityRoot(patches.v1.E2Ee.PublishIdentityRootRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.PublishIdentityRootResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPublishIdentityRootMethod(), responseObserver);
    }

    /**
     * <pre>
     * The current messaging root of any actor the caller may message. This is first-contact
     * material, not proof: the node could substitute it, which is exactly what safety-number
     * comparison over an authenticated channel exists to detect (ADR 0020 §3).
     * </pre>
     */
    default void getIdentityRoot(patches.v1.E2Ee.GetIdentityRootRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetIdentityRootResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetIdentityRootMethod(), responseObserver);
    }

    /**
     * <pre>
     * Registers one root-certified device and, in the same transaction, the roster that lists it
     * and its initial prekeys. Atomic on purpose: a device that peers can find but cannot start a
     * session with, or a device with prekeys but no roster entry, is a half-enrolled device.
     * </pre>
     */
    default void enrollDevice(patches.v1.E2Ee.EnrollDeviceRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.EnrollDeviceResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getEnrollDeviceMethod(), responseObserver);
    }

    /**
     * <pre>
     * Revokes a device and publishes the roster that excludes it. The node deletes the device's
     * unused public prekeys and stops delivering to it. Revocation cannot retract keys or
     * plaintext the device already holds, and it is never a remote wipe (ADR 0020 §10).
     * </pre>
     */
    default void revokeDevice(patches.v1.E2Ee.RevokeDeviceRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.RevokeDeviceResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRevokeDeviceMethod(), responseObserver);
    }

    /**
     * <pre>
     * Appends the next roster to the caller's append-only roster log. Rejected unless it is
     * exactly `current.sequence + 1` and chains to the current digest.
     * </pre>
     */
    default void publishDeviceRoster(patches.v1.E2Ee.PublishDeviceRosterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.PublishDeviceRosterResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPublishDeviceRosterMethod(), responseObserver);
    }

    /**
     * <pre>
     * The newest roster of an actor, with the device certificates it references.
     * </pre>
     */
    default void getDeviceRoster(patches.v1.E2Ee.GetDeviceRosterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetDeviceRosterResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetDeviceRosterMethod(), responseObserver);
    }

    /**
     * <pre>
     * The roster log from the caller's last verified sequence forward, so a client can verify the
     * hash chain itself instead of trusting the node's newest-roster claim. This is what makes a
     * node rollback or a split view detectable to communicating devices (ADR 0020 §2).
     * </pre>
     */
    default void listDeviceRosters(patches.v1.E2Ee.ListDeviceRostersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListDeviceRostersResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListDeviceRostersMethod(), responseObserver);
    }

    /**
     * <pre>
     * Rotates the calling device's signed prekey and/or tops up its one-time prekeys.
     * </pre>
     */
    default void uploadPrekeys(patches.v1.E2Ee.UploadPrekeysRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.UploadPrekeysResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getUploadPrekeysMethod(), responseObserver);
    }

    /**
     * <pre>
     * The calling device's own prekey inventory, so it knows when to replenish or rotate. Never
     * another actor's: remaining-prekey counts for someone else are an availability oracle.
     * </pre>
     */
    default void getPrekeyInventory(patches.v1.E2Ee.GetPrekeyInventoryRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetPrekeyInventoryResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetPrekeyInventoryMethod(), responseObserver);
    }

    /**
     * <pre>
     * Claims one bundle per active recipient device for X3DH-class setup. Atomically removes at
     * most one one-time prekey per device per call, and rate-limits draining (ADR 0020 §5).
     * </pre>
     */
    default void claimPrekeyBundles(patches.v1.E2Ee.ClaimPrekeyBundlesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ClaimPrekeyBundlesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getClaimPrekeyBundlesMethod(), responseObserver);
    }

    /**
     * <pre>
     * Creates an `E2EE_V1` conversation together with its first logical message. Separate from
     * `DirectMessageService.CreateConversation` because that RPC takes an `initial_body` string:
     * there is no plaintext body to give it here, and adding an "empty body means encrypted" mode
     * to it would put the two security modes behind one ambiguous call.
     * </pre>
     */
    default void createE2eeConversation(patches.v1.E2Ee.CreateE2eeConversationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.CreateE2eeConversationResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCreateE2eeConversationMethod(), responseObserver);
    }

    /**
     * <pre>
     * Everything a sender needs to build a correct fanout: the membership epoch, the members, and
     * each member's current roster and active devices.
     * </pre>
     */
    default void getE2eeConversationState(patches.v1.E2Ee.GetE2eeConversationStateRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetE2eeConversationStateResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetE2eeConversationStateMethod(), responseObserver);
    }

    /**
     * <pre>
     * Adds one member. Group size stays bounded at 8 (spec §183.3, ADR 0020 §7); the transition
     * is a device-signed group-control event that establishes the next membership epoch. The new
     * member receives future messages only — no history is re-encrypted or replayed to them.
     * </pre>
     */
    default void addE2eeMember(patches.v1.E2Ee.AddE2eeMemberRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.AddE2eeMemberResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAddE2eeMemberMethod(), responseObserver);
    }

    /**
     * <pre>
     * Removes one member (a member removing themselves is a leave). The transition is a
     * device-signed group-control event that establishes the next membership epoch, and the
     * removed member's devices are excluded from every later fanout: a send composed under the
     * old epoch is rejected rather than delivered to them (ADR 0020 §7).
     * </pre>
     */
    default void removeE2eeMember(patches.v1.E2Ee.RemoveE2eeMemberRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.RemoveE2eeMemberResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRemoveE2eeMemberMethod(), responseObserver);
    }

    /**
     * <pre>
     * The group-control transcript from the caller's last verified epoch forward, so a client
     * verifies the membership hash chain itself instead of trusting the node's current-epoch
     * claim — the conversation-level counterpart of `ListDeviceRosters` (ADR 0020 §7).
     * </pre>
     */
    default void listE2eeGroupControlEvents(patches.v1.E2Ee.ListE2eeGroupControlEventsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListE2eeGroupControlEventsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListE2eeGroupControlEventsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Accepts one logical message as one bounded, all-or-nothing per-device fanout, and returns
     * the node's franking tag over it (ADR 0020 §7, §9).
     * </pre>
     */
    default void sendEnvelopes(patches.v1.E2Ee.SendEnvelopesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.SendEnvelopesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getSendEnvelopesMethod(), responseObserver);
    }

    /**
     * <pre>
     * The calling device's mailbox, oldest first, keyset-paginated. Poll-based like every other
     * Patches delivery path (spec §183.3) — there is no push and no stream.
     * </pre>
     */
    default void listMailboxEnvelopes(patches.v1.E2Ee.ListMailboxEnvelopesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListMailboxEnvelopesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListMailboxEnvelopesMethod(), responseObserver);
    }

    /**
     * <pre>
     * Acknowledges envelopes the calling device has durably committed. An acknowledgement lets
     * the node clean the mailbox; it is never surfaced to the sender as a read receipt, which
     * spec §183.3 and §194 both prohibit.
     * </pre>
     */
    default void acknowledgeEnvelopes(patches.v1.E2Ee.AcknowledgeEnvelopesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.AcknowledgeEnvelopesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAcknowledgeEnvelopesMethod(), responseObserver);
    }

    /**
     * <pre>
     * Attaches reporter-disclosed evidence to a report created by `ModerationService.CreateReport`.
     * The node verifies the franking commitment and its own tag. It never decrypts anything.
     * </pre>
     */
    default void attachReportEvidence(patches.v1.E2Ee.AttachReportEvidenceRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.AttachReportEvidenceResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAttachReportEvidenceMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service E2eeService.
   * <pre>
   * End-to-end encrypted direct messages (spec §183, §194, §195.1; ADR 0020).
   * The whole point of this service is a boundary, so it is stated once here and re-stated as an
   * invariant on every message below:
   *   * The node routes, authorizes, rate-limits, and retains **opaque bytes**. It never receives
   *     an E2EE message body, a message key, ratchet state, a device private key, or a recovery
   *     key. `E2eeReportEvidenceItem.disclosed_plaintext` is the single, deliberate exception in
   *     this entire schema — plaintext a reporter explicitly selected and submitted (ADR 0020 §9).
   *   * `E2EE_V1` is the only conversation security mode (ADR 0030, B-095 — the server-visible
   *     `LEGACY_SERVER_VISIBLE` mode this once coexisted with is retired, its enum value
   *     reserved). It is immutable, fixed at creation: there is no RPC here — nor will there ever
   *     be one — that converts a conversation's mode after the fact.
   *   * An E2EE send never falls back to plaintext or to a server-held key. When a device, a
   *     prekey, or the capability is unavailable, the send **fails** (ADR 0020 §1.2).
   *   * Only an `E2EE_V1` conversation may be described to a user as encrypted or end-to-end.
   *     Spec §194 forbids that word for every other conversation, absolutely and without a
   *     "mostly"/"soon" qualifier (see `docs/architecture/e2ee.md` §8 for the required copy).
   *   * Nothing here crosses `FederationGateway`. ADR 0020 §13 authorizes local-node E2EE only.
   * Pagination is keyset-only (spec §153). Every list RPC takes an opaque cursor and returns
   * `PageInfo`; no RPC in this file has an offset, a page number, a sort, or an order parameter.
   * </pre>
   */
  public static abstract class E2eeServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return E2eeServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service E2eeService.
   * <pre>
   * End-to-end encrypted direct messages (spec §183, §194, §195.1; ADR 0020).
   * The whole point of this service is a boundary, so it is stated once here and re-stated as an
   * invariant on every message below:
   *   * The node routes, authorizes, rate-limits, and retains **opaque bytes**. It never receives
   *     an E2EE message body, a message key, ratchet state, a device private key, or a recovery
   *     key. `E2eeReportEvidenceItem.disclosed_plaintext` is the single, deliberate exception in
   *     this entire schema — plaintext a reporter explicitly selected and submitted (ADR 0020 §9).
   *   * `E2EE_V1` is the only conversation security mode (ADR 0030, B-095 — the server-visible
   *     `LEGACY_SERVER_VISIBLE` mode this once coexisted with is retired, its enum value
   *     reserved). It is immutable, fixed at creation: there is no RPC here — nor will there ever
   *     be one — that converts a conversation's mode after the fact.
   *   * An E2EE send never falls back to plaintext or to a server-held key. When a device, a
   *     prekey, or the capability is unavailable, the send **fails** (ADR 0020 §1.2).
   *   * Only an `E2EE_V1` conversation may be described to a user as encrypted or end-to-end.
   *     Spec §194 forbids that word for every other conversation, absolutely and without a
   *     "mostly"/"soon" qualifier (see `docs/architecture/e2ee.md` §8 for the required copy).
   *   * Nothing here crosses `FederationGateway`. ADR 0020 §13 authorizes local-node E2EE only.
   * Pagination is keyset-only (spec §153). Every list RPC takes an opaque cursor and returns
   * `PageInfo`; no RPC in this file has an offset, a page number, a sort, or an order parameter.
   * </pre>
   */
  public static final class E2eeServiceStub
      extends io.grpc.stub.AbstractAsyncStub<E2eeServiceStub> {
    private E2eeServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected E2eeServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new E2eeServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * What this node supports and whether it is switched on. Callable before enrollment, because
     * a client must be able to discover that E2EE is unavailable *before* it offers the option.
     * </pre>
     */
    public void getE2eeCapability(patches.v1.E2Ee.GetE2eeCapabilityRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetE2eeCapabilityResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetE2eeCapabilityMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Publishes the caller's messaging identity root, or rotates it to a new generation. A
     * rotation is a hard identity change for every contact (ADR 0020 §3) — the node stores and
     * serves it, and never certifies it.
     * </pre>
     */
    public void publishIdentityRoot(patches.v1.E2Ee.PublishIdentityRootRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.PublishIdentityRootResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPublishIdentityRootMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The current messaging root of any actor the caller may message. This is first-contact
     * material, not proof: the node could substitute it, which is exactly what safety-number
     * comparison over an authenticated channel exists to detect (ADR 0020 §3).
     * </pre>
     */
    public void getIdentityRoot(patches.v1.E2Ee.GetIdentityRootRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetIdentityRootResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetIdentityRootMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Registers one root-certified device and, in the same transaction, the roster that lists it
     * and its initial prekeys. Atomic on purpose: a device that peers can find but cannot start a
     * session with, or a device with prekeys but no roster entry, is a half-enrolled device.
     * </pre>
     */
    public void enrollDevice(patches.v1.E2Ee.EnrollDeviceRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.EnrollDeviceResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getEnrollDeviceMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Revokes a device and publishes the roster that excludes it. The node deletes the device's
     * unused public prekeys and stops delivering to it. Revocation cannot retract keys or
     * plaintext the device already holds, and it is never a remote wipe (ADR 0020 §10).
     * </pre>
     */
    public void revokeDevice(patches.v1.E2Ee.RevokeDeviceRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.RevokeDeviceResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRevokeDeviceMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Appends the next roster to the caller's append-only roster log. Rejected unless it is
     * exactly `current.sequence + 1` and chains to the current digest.
     * </pre>
     */
    public void publishDeviceRoster(patches.v1.E2Ee.PublishDeviceRosterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.PublishDeviceRosterResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPublishDeviceRosterMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The newest roster of an actor, with the device certificates it references.
     * </pre>
     */
    public void getDeviceRoster(patches.v1.E2Ee.GetDeviceRosterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetDeviceRosterResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetDeviceRosterMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The roster log from the caller's last verified sequence forward, so a client can verify the
     * hash chain itself instead of trusting the node's newest-roster claim. This is what makes a
     * node rollback or a split view detectable to communicating devices (ADR 0020 §2).
     * </pre>
     */
    public void listDeviceRosters(patches.v1.E2Ee.ListDeviceRostersRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListDeviceRostersResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListDeviceRostersMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Rotates the calling device's signed prekey and/or tops up its one-time prekeys.
     * </pre>
     */
    public void uploadPrekeys(patches.v1.E2Ee.UploadPrekeysRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.UploadPrekeysResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getUploadPrekeysMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The calling device's own prekey inventory, so it knows when to replenish or rotate. Never
     * another actor's: remaining-prekey counts for someone else are an availability oracle.
     * </pre>
     */
    public void getPrekeyInventory(patches.v1.E2Ee.GetPrekeyInventoryRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetPrekeyInventoryResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetPrekeyInventoryMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Claims one bundle per active recipient device for X3DH-class setup. Atomically removes at
     * most one one-time prekey per device per call, and rate-limits draining (ADR 0020 §5).
     * </pre>
     */
    public void claimPrekeyBundles(patches.v1.E2Ee.ClaimPrekeyBundlesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ClaimPrekeyBundlesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getClaimPrekeyBundlesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Creates an `E2EE_V1` conversation together with its first logical message. Separate from
     * `DirectMessageService.CreateConversation` because that RPC takes an `initial_body` string:
     * there is no plaintext body to give it here, and adding an "empty body means encrypted" mode
     * to it would put the two security modes behind one ambiguous call.
     * </pre>
     */
    public void createE2eeConversation(patches.v1.E2Ee.CreateE2eeConversationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.CreateE2eeConversationResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCreateE2eeConversationMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Everything a sender needs to build a correct fanout: the membership epoch, the members, and
     * each member's current roster and active devices.
     * </pre>
     */
    public void getE2eeConversationState(patches.v1.E2Ee.GetE2eeConversationStateRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetE2eeConversationStateResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetE2eeConversationStateMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Adds one member. Group size stays bounded at 8 (spec §183.3, ADR 0020 §7); the transition
     * is a device-signed group-control event that establishes the next membership epoch. The new
     * member receives future messages only — no history is re-encrypted or replayed to them.
     * </pre>
     */
    public void addE2eeMember(patches.v1.E2Ee.AddE2eeMemberRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.AddE2eeMemberResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAddE2eeMemberMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Removes one member (a member removing themselves is a leave). The transition is a
     * device-signed group-control event that establishes the next membership epoch, and the
     * removed member's devices are excluded from every later fanout: a send composed under the
     * old epoch is rejected rather than delivered to them (ADR 0020 §7).
     * </pre>
     */
    public void removeE2eeMember(patches.v1.E2Ee.RemoveE2eeMemberRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.RemoveE2eeMemberResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRemoveE2eeMemberMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The group-control transcript from the caller's last verified epoch forward, so a client
     * verifies the membership hash chain itself instead of trusting the node's current-epoch
     * claim — the conversation-level counterpart of `ListDeviceRosters` (ADR 0020 §7).
     * </pre>
     */
    public void listE2eeGroupControlEvents(patches.v1.E2Ee.ListE2eeGroupControlEventsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListE2eeGroupControlEventsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListE2eeGroupControlEventsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Accepts one logical message as one bounded, all-or-nothing per-device fanout, and returns
     * the node's franking tag over it (ADR 0020 §7, §9).
     * </pre>
     */
    public void sendEnvelopes(patches.v1.E2Ee.SendEnvelopesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.SendEnvelopesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getSendEnvelopesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The calling device's mailbox, oldest first, keyset-paginated. Poll-based like every other
     * Patches delivery path (spec §183.3) — there is no push and no stream.
     * </pre>
     */
    public void listMailboxEnvelopes(patches.v1.E2Ee.ListMailboxEnvelopesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListMailboxEnvelopesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListMailboxEnvelopesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Acknowledges envelopes the calling device has durably committed. An acknowledgement lets
     * the node clean the mailbox; it is never surfaced to the sender as a read receipt, which
     * spec §183.3 and §194 both prohibit.
     * </pre>
     */
    public void acknowledgeEnvelopes(patches.v1.E2Ee.AcknowledgeEnvelopesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.AcknowledgeEnvelopesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAcknowledgeEnvelopesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Attaches reporter-disclosed evidence to a report created by `ModerationService.CreateReport`.
     * The node verifies the franking commitment and its own tag. It never decrypts anything.
     * </pre>
     */
    public void attachReportEvidence(patches.v1.E2Ee.AttachReportEvidenceRequest request,
        io.grpc.stub.StreamObserver<patches.v1.E2Ee.AttachReportEvidenceResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAttachReportEvidenceMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service E2eeService.
   * <pre>
   * End-to-end encrypted direct messages (spec §183, §194, §195.1; ADR 0020).
   * The whole point of this service is a boundary, so it is stated once here and re-stated as an
   * invariant on every message below:
   *   * The node routes, authorizes, rate-limits, and retains **opaque bytes**. It never receives
   *     an E2EE message body, a message key, ratchet state, a device private key, or a recovery
   *     key. `E2eeReportEvidenceItem.disclosed_plaintext` is the single, deliberate exception in
   *     this entire schema — plaintext a reporter explicitly selected and submitted (ADR 0020 §9).
   *   * `E2EE_V1` is the only conversation security mode (ADR 0030, B-095 — the server-visible
   *     `LEGACY_SERVER_VISIBLE` mode this once coexisted with is retired, its enum value
   *     reserved). It is immutable, fixed at creation: there is no RPC here — nor will there ever
   *     be one — that converts a conversation's mode after the fact.
   *   * An E2EE send never falls back to plaintext or to a server-held key. When a device, a
   *     prekey, or the capability is unavailable, the send **fails** (ADR 0020 §1.2).
   *   * Only an `E2EE_V1` conversation may be described to a user as encrypted or end-to-end.
   *     Spec §194 forbids that word for every other conversation, absolutely and without a
   *     "mostly"/"soon" qualifier (see `docs/architecture/e2ee.md` §8 for the required copy).
   *   * Nothing here crosses `FederationGateway`. ADR 0020 §13 authorizes local-node E2EE only.
   * Pagination is keyset-only (spec §153). Every list RPC takes an opaque cursor and returns
   * `PageInfo`; no RPC in this file has an offset, a page number, a sort, or an order parameter.
   * </pre>
   */
  public static final class E2eeServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<E2eeServiceBlockingV2Stub> {
    private E2eeServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected E2eeServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new E2eeServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * What this node supports and whether it is switched on. Callable before enrollment, because
     * a client must be able to discover that E2EE is unavailable *before* it offers the option.
     * </pre>
     */
    public patches.v1.E2Ee.GetE2eeCapabilityResponse getE2eeCapability(patches.v1.E2Ee.GetE2eeCapabilityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetE2eeCapabilityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Publishes the caller's messaging identity root, or rotates it to a new generation. A
     * rotation is a hard identity change for every contact (ADR 0020 §3) — the node stores and
     * serves it, and never certifies it.
     * </pre>
     */
    public patches.v1.E2Ee.PublishIdentityRootResponse publishIdentityRoot(patches.v1.E2Ee.PublishIdentityRootRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPublishIdentityRootMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The current messaging root of any actor the caller may message. This is first-contact
     * material, not proof: the node could substitute it, which is exactly what safety-number
     * comparison over an authenticated channel exists to detect (ADR 0020 §3).
     * </pre>
     */
    public patches.v1.E2Ee.GetIdentityRootResponse getIdentityRoot(patches.v1.E2Ee.GetIdentityRootRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetIdentityRootMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Registers one root-certified device and, in the same transaction, the roster that lists it
     * and its initial prekeys. Atomic on purpose: a device that peers can find but cannot start a
     * session with, or a device with prekeys but no roster entry, is a half-enrolled device.
     * </pre>
     */
    public patches.v1.E2Ee.EnrollDeviceResponse enrollDevice(patches.v1.E2Ee.EnrollDeviceRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getEnrollDeviceMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revokes a device and publishes the roster that excludes it. The node deletes the device's
     * unused public prekeys and stops delivering to it. Revocation cannot retract keys or
     * plaintext the device already holds, and it is never a remote wipe (ADR 0020 §10).
     * </pre>
     */
    public patches.v1.E2Ee.RevokeDeviceResponse revokeDevice(patches.v1.E2Ee.RevokeDeviceRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRevokeDeviceMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Appends the next roster to the caller's append-only roster log. Rejected unless it is
     * exactly `current.sequence + 1` and chains to the current digest.
     * </pre>
     */
    public patches.v1.E2Ee.PublishDeviceRosterResponse publishDeviceRoster(patches.v1.E2Ee.PublishDeviceRosterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPublishDeviceRosterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The newest roster of an actor, with the device certificates it references.
     * </pre>
     */
    public patches.v1.E2Ee.GetDeviceRosterResponse getDeviceRoster(patches.v1.E2Ee.GetDeviceRosterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetDeviceRosterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The roster log from the caller's last verified sequence forward, so a client can verify the
     * hash chain itself instead of trusting the node's newest-roster claim. This is what makes a
     * node rollback or a split view detectable to communicating devices (ADR 0020 §2).
     * </pre>
     */
    public patches.v1.E2Ee.ListDeviceRostersResponse listDeviceRosters(patches.v1.E2Ee.ListDeviceRostersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListDeviceRostersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rotates the calling device's signed prekey and/or tops up its one-time prekeys.
     * </pre>
     */
    public patches.v1.E2Ee.UploadPrekeysResponse uploadPrekeys(patches.v1.E2Ee.UploadPrekeysRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUploadPrekeysMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The calling device's own prekey inventory, so it knows when to replenish or rotate. Never
     * another actor's: remaining-prekey counts for someone else are an availability oracle.
     * </pre>
     */
    public patches.v1.E2Ee.GetPrekeyInventoryResponse getPrekeyInventory(patches.v1.E2Ee.GetPrekeyInventoryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPrekeyInventoryMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Claims one bundle per active recipient device for X3DH-class setup. Atomically removes at
     * most one one-time prekey per device per call, and rate-limits draining (ADR 0020 §5).
     * </pre>
     */
    public patches.v1.E2Ee.ClaimPrekeyBundlesResponse claimPrekeyBundles(patches.v1.E2Ee.ClaimPrekeyBundlesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getClaimPrekeyBundlesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Creates an `E2EE_V1` conversation together with its first logical message. Separate from
     * `DirectMessageService.CreateConversation` because that RPC takes an `initial_body` string:
     * there is no plaintext body to give it here, and adding an "empty body means encrypted" mode
     * to it would put the two security modes behind one ambiguous call.
     * </pre>
     */
    public patches.v1.E2Ee.CreateE2eeConversationResponse createE2eeConversation(patches.v1.E2Ee.CreateE2eeConversationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateE2eeConversationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Everything a sender needs to build a correct fanout: the membership epoch, the members, and
     * each member's current roster and active devices.
     * </pre>
     */
    public patches.v1.E2Ee.GetE2eeConversationStateResponse getE2eeConversationState(patches.v1.E2Ee.GetE2eeConversationStateRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetE2eeConversationStateMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Adds one member. Group size stays bounded at 8 (spec §183.3, ADR 0020 §7); the transition
     * is a device-signed group-control event that establishes the next membership epoch. The new
     * member receives future messages only — no history is re-encrypted or replayed to them.
     * </pre>
     */
    public patches.v1.E2Ee.AddE2eeMemberResponse addE2eeMember(patches.v1.E2Ee.AddE2eeMemberRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAddE2eeMemberMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Removes one member (a member removing themselves is a leave). The transition is a
     * device-signed group-control event that establishes the next membership epoch, and the
     * removed member's devices are excluded from every later fanout: a send composed under the
     * old epoch is rejected rather than delivered to them (ADR 0020 §7).
     * </pre>
     */
    public patches.v1.E2Ee.RemoveE2eeMemberResponse removeE2eeMember(patches.v1.E2Ee.RemoveE2eeMemberRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRemoveE2eeMemberMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The group-control transcript from the caller's last verified epoch forward, so a client
     * verifies the membership hash chain itself instead of trusting the node's current-epoch
     * claim — the conversation-level counterpart of `ListDeviceRosters` (ADR 0020 §7).
     * </pre>
     */
    public patches.v1.E2Ee.ListE2eeGroupControlEventsResponse listE2eeGroupControlEvents(patches.v1.E2Ee.ListE2eeGroupControlEventsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListE2eeGroupControlEventsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Accepts one logical message as one bounded, all-or-nothing per-device fanout, and returns
     * the node's franking tag over it (ADR 0020 §7, §9).
     * </pre>
     */
    public patches.v1.E2Ee.SendEnvelopesResponse sendEnvelopes(patches.v1.E2Ee.SendEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSendEnvelopesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The calling device's mailbox, oldest first, keyset-paginated. Poll-based like every other
     * Patches delivery path (spec §183.3) — there is no push and no stream.
     * </pre>
     */
    public patches.v1.E2Ee.ListMailboxEnvelopesResponse listMailboxEnvelopes(patches.v1.E2Ee.ListMailboxEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMailboxEnvelopesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Acknowledges envelopes the calling device has durably committed. An acknowledgement lets
     * the node clean the mailbox; it is never surfaced to the sender as a read receipt, which
     * spec §183.3 and §194 both prohibit.
     * </pre>
     */
    public patches.v1.E2Ee.AcknowledgeEnvelopesResponse acknowledgeEnvelopes(patches.v1.E2Ee.AcknowledgeEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAcknowledgeEnvelopesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Attaches reporter-disclosed evidence to a report created by `ModerationService.CreateReport`.
     * The node verifies the franking commitment and its own tag. It never decrypts anything.
     * </pre>
     */
    public patches.v1.E2Ee.AttachReportEvidenceResponse attachReportEvidence(patches.v1.E2Ee.AttachReportEvidenceRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAttachReportEvidenceMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service E2eeService.
   * <pre>
   * End-to-end encrypted direct messages (spec §183, §194, §195.1; ADR 0020).
   * The whole point of this service is a boundary, so it is stated once here and re-stated as an
   * invariant on every message below:
   *   * The node routes, authorizes, rate-limits, and retains **opaque bytes**. It never receives
   *     an E2EE message body, a message key, ratchet state, a device private key, or a recovery
   *     key. `E2eeReportEvidenceItem.disclosed_plaintext` is the single, deliberate exception in
   *     this entire schema — plaintext a reporter explicitly selected and submitted (ADR 0020 §9).
   *   * `E2EE_V1` is the only conversation security mode (ADR 0030, B-095 — the server-visible
   *     `LEGACY_SERVER_VISIBLE` mode this once coexisted with is retired, its enum value
   *     reserved). It is immutable, fixed at creation: there is no RPC here — nor will there ever
   *     be one — that converts a conversation's mode after the fact.
   *   * An E2EE send never falls back to plaintext or to a server-held key. When a device, a
   *     prekey, or the capability is unavailable, the send **fails** (ADR 0020 §1.2).
   *   * Only an `E2EE_V1` conversation may be described to a user as encrypted or end-to-end.
   *     Spec §194 forbids that word for every other conversation, absolutely and without a
   *     "mostly"/"soon" qualifier (see `docs/architecture/e2ee.md` §8 for the required copy).
   *   * Nothing here crosses `FederationGateway`. ADR 0020 §13 authorizes local-node E2EE only.
   * Pagination is keyset-only (spec §153). Every list RPC takes an opaque cursor and returns
   * `PageInfo`; no RPC in this file has an offset, a page number, a sort, or an order parameter.
   * </pre>
   */
  public static final class E2eeServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<E2eeServiceBlockingStub> {
    private E2eeServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected E2eeServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new E2eeServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * What this node supports and whether it is switched on. Callable before enrollment, because
     * a client must be able to discover that E2EE is unavailable *before* it offers the option.
     * </pre>
     */
    public patches.v1.E2Ee.GetE2eeCapabilityResponse getE2eeCapability(patches.v1.E2Ee.GetE2eeCapabilityRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetE2eeCapabilityMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Publishes the caller's messaging identity root, or rotates it to a new generation. A
     * rotation is a hard identity change for every contact (ADR 0020 §3) — the node stores and
     * serves it, and never certifies it.
     * </pre>
     */
    public patches.v1.E2Ee.PublishIdentityRootResponse publishIdentityRoot(patches.v1.E2Ee.PublishIdentityRootRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPublishIdentityRootMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The current messaging root of any actor the caller may message. This is first-contact
     * material, not proof: the node could substitute it, which is exactly what safety-number
     * comparison over an authenticated channel exists to detect (ADR 0020 §3).
     * </pre>
     */
    public patches.v1.E2Ee.GetIdentityRootResponse getIdentityRoot(patches.v1.E2Ee.GetIdentityRootRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetIdentityRootMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Registers one root-certified device and, in the same transaction, the roster that lists it
     * and its initial prekeys. Atomic on purpose: a device that peers can find but cannot start a
     * session with, or a device with prekeys but no roster entry, is a half-enrolled device.
     * </pre>
     */
    public patches.v1.E2Ee.EnrollDeviceResponse enrollDevice(patches.v1.E2Ee.EnrollDeviceRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getEnrollDeviceMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revokes a device and publishes the roster that excludes it. The node deletes the device's
     * unused public prekeys and stops delivering to it. Revocation cannot retract keys or
     * plaintext the device already holds, and it is never a remote wipe (ADR 0020 §10).
     * </pre>
     */
    public patches.v1.E2Ee.RevokeDeviceResponse revokeDevice(patches.v1.E2Ee.RevokeDeviceRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRevokeDeviceMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Appends the next roster to the caller's append-only roster log. Rejected unless it is
     * exactly `current.sequence + 1` and chains to the current digest.
     * </pre>
     */
    public patches.v1.E2Ee.PublishDeviceRosterResponse publishDeviceRoster(patches.v1.E2Ee.PublishDeviceRosterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPublishDeviceRosterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The newest roster of an actor, with the device certificates it references.
     * </pre>
     */
    public patches.v1.E2Ee.GetDeviceRosterResponse getDeviceRoster(patches.v1.E2Ee.GetDeviceRosterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetDeviceRosterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The roster log from the caller's last verified sequence forward, so a client can verify the
     * hash chain itself instead of trusting the node's newest-roster claim. This is what makes a
     * node rollback or a split view detectable to communicating devices (ADR 0020 §2).
     * </pre>
     */
    public patches.v1.E2Ee.ListDeviceRostersResponse listDeviceRosters(patches.v1.E2Ee.ListDeviceRostersRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListDeviceRostersMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rotates the calling device's signed prekey and/or tops up its one-time prekeys.
     * </pre>
     */
    public patches.v1.E2Ee.UploadPrekeysResponse uploadPrekeys(patches.v1.E2Ee.UploadPrekeysRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getUploadPrekeysMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The calling device's own prekey inventory, so it knows when to replenish or rotate. Never
     * another actor's: remaining-prekey counts for someone else are an availability oracle.
     * </pre>
     */
    public patches.v1.E2Ee.GetPrekeyInventoryResponse getPrekeyInventory(patches.v1.E2Ee.GetPrekeyInventoryRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetPrekeyInventoryMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Claims one bundle per active recipient device for X3DH-class setup. Atomically removes at
     * most one one-time prekey per device per call, and rate-limits draining (ADR 0020 §5).
     * </pre>
     */
    public patches.v1.E2Ee.ClaimPrekeyBundlesResponse claimPrekeyBundles(patches.v1.E2Ee.ClaimPrekeyBundlesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getClaimPrekeyBundlesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Creates an `E2EE_V1` conversation together with its first logical message. Separate from
     * `DirectMessageService.CreateConversation` because that RPC takes an `initial_body` string:
     * there is no plaintext body to give it here, and adding an "empty body means encrypted" mode
     * to it would put the two security modes behind one ambiguous call.
     * </pre>
     */
    public patches.v1.E2Ee.CreateE2eeConversationResponse createE2eeConversation(patches.v1.E2Ee.CreateE2eeConversationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCreateE2eeConversationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Everything a sender needs to build a correct fanout: the membership epoch, the members, and
     * each member's current roster and active devices.
     * </pre>
     */
    public patches.v1.E2Ee.GetE2eeConversationStateResponse getE2eeConversationState(patches.v1.E2Ee.GetE2eeConversationStateRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetE2eeConversationStateMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Adds one member. Group size stays bounded at 8 (spec §183.3, ADR 0020 §7); the transition
     * is a device-signed group-control event that establishes the next membership epoch. The new
     * member receives future messages only — no history is re-encrypted or replayed to them.
     * </pre>
     */
    public patches.v1.E2Ee.AddE2eeMemberResponse addE2eeMember(patches.v1.E2Ee.AddE2eeMemberRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAddE2eeMemberMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Removes one member (a member removing themselves is a leave). The transition is a
     * device-signed group-control event that establishes the next membership epoch, and the
     * removed member's devices are excluded from every later fanout: a send composed under the
     * old epoch is rejected rather than delivered to them (ADR 0020 §7).
     * </pre>
     */
    public patches.v1.E2Ee.RemoveE2eeMemberResponse removeE2eeMember(patches.v1.E2Ee.RemoveE2eeMemberRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRemoveE2eeMemberMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The group-control transcript from the caller's last verified epoch forward, so a client
     * verifies the membership hash chain itself instead of trusting the node's current-epoch
     * claim — the conversation-level counterpart of `ListDeviceRosters` (ADR 0020 §7).
     * </pre>
     */
    public patches.v1.E2Ee.ListE2eeGroupControlEventsResponse listE2eeGroupControlEvents(patches.v1.E2Ee.ListE2eeGroupControlEventsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListE2eeGroupControlEventsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Accepts one logical message as one bounded, all-or-nothing per-device fanout, and returns
     * the node's franking tag over it (ADR 0020 §7, §9).
     * </pre>
     */
    public patches.v1.E2Ee.SendEnvelopesResponse sendEnvelopes(patches.v1.E2Ee.SendEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getSendEnvelopesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The calling device's mailbox, oldest first, keyset-paginated. Poll-based like every other
     * Patches delivery path (spec §183.3) — there is no push and no stream.
     * </pre>
     */
    public patches.v1.E2Ee.ListMailboxEnvelopesResponse listMailboxEnvelopes(patches.v1.E2Ee.ListMailboxEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListMailboxEnvelopesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Acknowledges envelopes the calling device has durably committed. An acknowledgement lets
     * the node clean the mailbox; it is never surfaced to the sender as a read receipt, which
     * spec §183.3 and §194 both prohibit.
     * </pre>
     */
    public patches.v1.E2Ee.AcknowledgeEnvelopesResponse acknowledgeEnvelopes(patches.v1.E2Ee.AcknowledgeEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAcknowledgeEnvelopesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Attaches reporter-disclosed evidence to a report created by `ModerationService.CreateReport`.
     * The node verifies the franking commitment and its own tag. It never decrypts anything.
     * </pre>
     */
    public patches.v1.E2Ee.AttachReportEvidenceResponse attachReportEvidence(patches.v1.E2Ee.AttachReportEvidenceRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAttachReportEvidenceMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service E2eeService.
   * <pre>
   * End-to-end encrypted direct messages (spec §183, §194, §195.1; ADR 0020).
   * The whole point of this service is a boundary, so it is stated once here and re-stated as an
   * invariant on every message below:
   *   * The node routes, authorizes, rate-limits, and retains **opaque bytes**. It never receives
   *     an E2EE message body, a message key, ratchet state, a device private key, or a recovery
   *     key. `E2eeReportEvidenceItem.disclosed_plaintext` is the single, deliberate exception in
   *     this entire schema — plaintext a reporter explicitly selected and submitted (ADR 0020 §9).
   *   * `E2EE_V1` is the only conversation security mode (ADR 0030, B-095 — the server-visible
   *     `LEGACY_SERVER_VISIBLE` mode this once coexisted with is retired, its enum value
   *     reserved). It is immutable, fixed at creation: there is no RPC here — nor will there ever
   *     be one — that converts a conversation's mode after the fact.
   *   * An E2EE send never falls back to plaintext or to a server-held key. When a device, a
   *     prekey, or the capability is unavailable, the send **fails** (ADR 0020 §1.2).
   *   * Only an `E2EE_V1` conversation may be described to a user as encrypted or end-to-end.
   *     Spec §194 forbids that word for every other conversation, absolutely and without a
   *     "mostly"/"soon" qualifier (see `docs/architecture/e2ee.md` §8 for the required copy).
   *   * Nothing here crosses `FederationGateway`. ADR 0020 §13 authorizes local-node E2EE only.
   * Pagination is keyset-only (spec §153). Every list RPC takes an opaque cursor and returns
   * `PageInfo`; no RPC in this file has an offset, a page number, a sort, or an order parameter.
   * </pre>
   */
  public static final class E2eeServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<E2eeServiceFutureStub> {
    private E2eeServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected E2eeServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new E2eeServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * What this node supports and whether it is switched on. Callable before enrollment, because
     * a client must be able to discover that E2EE is unavailable *before* it offers the option.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.GetE2eeCapabilityResponse> getE2eeCapability(
        patches.v1.E2Ee.GetE2eeCapabilityRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetE2eeCapabilityMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Publishes the caller's messaging identity root, or rotates it to a new generation. A
     * rotation is a hard identity change for every contact (ADR 0020 §3) — the node stores and
     * serves it, and never certifies it.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.PublishIdentityRootResponse> publishIdentityRoot(
        patches.v1.E2Ee.PublishIdentityRootRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPublishIdentityRootMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The current messaging root of any actor the caller may message. This is first-contact
     * material, not proof: the node could substitute it, which is exactly what safety-number
     * comparison over an authenticated channel exists to detect (ADR 0020 §3).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.GetIdentityRootResponse> getIdentityRoot(
        patches.v1.E2Ee.GetIdentityRootRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetIdentityRootMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Registers one root-certified device and, in the same transaction, the roster that lists it
     * and its initial prekeys. Atomic on purpose: a device that peers can find but cannot start a
     * session with, or a device with prekeys but no roster entry, is a half-enrolled device.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.EnrollDeviceResponse> enrollDevice(
        patches.v1.E2Ee.EnrollDeviceRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getEnrollDeviceMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Revokes a device and publishes the roster that excludes it. The node deletes the device's
     * unused public prekeys and stops delivering to it. Revocation cannot retract keys or
     * plaintext the device already holds, and it is never a remote wipe (ADR 0020 §10).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.RevokeDeviceResponse> revokeDevice(
        patches.v1.E2Ee.RevokeDeviceRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRevokeDeviceMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Appends the next roster to the caller's append-only roster log. Rejected unless it is
     * exactly `current.sequence + 1` and chains to the current digest.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.PublishDeviceRosterResponse> publishDeviceRoster(
        patches.v1.E2Ee.PublishDeviceRosterRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPublishDeviceRosterMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The newest roster of an actor, with the device certificates it references.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.GetDeviceRosterResponse> getDeviceRoster(
        patches.v1.E2Ee.GetDeviceRosterRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetDeviceRosterMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The roster log from the caller's last verified sequence forward, so a client can verify the
     * hash chain itself instead of trusting the node's newest-roster claim. This is what makes a
     * node rollback or a split view detectable to communicating devices (ADR 0020 §2).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.ListDeviceRostersResponse> listDeviceRosters(
        patches.v1.E2Ee.ListDeviceRostersRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListDeviceRostersMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Rotates the calling device's signed prekey and/or tops up its one-time prekeys.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.UploadPrekeysResponse> uploadPrekeys(
        patches.v1.E2Ee.UploadPrekeysRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getUploadPrekeysMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The calling device's own prekey inventory, so it knows when to replenish or rotate. Never
     * another actor's: remaining-prekey counts for someone else are an availability oracle.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.GetPrekeyInventoryResponse> getPrekeyInventory(
        patches.v1.E2Ee.GetPrekeyInventoryRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetPrekeyInventoryMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Claims one bundle per active recipient device for X3DH-class setup. Atomically removes at
     * most one one-time prekey per device per call, and rate-limits draining (ADR 0020 §5).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.ClaimPrekeyBundlesResponse> claimPrekeyBundles(
        patches.v1.E2Ee.ClaimPrekeyBundlesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getClaimPrekeyBundlesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Creates an `E2EE_V1` conversation together with its first logical message. Separate from
     * `DirectMessageService.CreateConversation` because that RPC takes an `initial_body` string:
     * there is no plaintext body to give it here, and adding an "empty body means encrypted" mode
     * to it would put the two security modes behind one ambiguous call.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.CreateE2eeConversationResponse> createE2eeConversation(
        patches.v1.E2Ee.CreateE2eeConversationRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCreateE2eeConversationMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Everything a sender needs to build a correct fanout: the membership epoch, the members, and
     * each member's current roster and active devices.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.GetE2eeConversationStateResponse> getE2eeConversationState(
        patches.v1.E2Ee.GetE2eeConversationStateRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetE2eeConversationStateMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Adds one member. Group size stays bounded at 8 (spec §183.3, ADR 0020 §7); the transition
     * is a device-signed group-control event that establishes the next membership epoch. The new
     * member receives future messages only — no history is re-encrypted or replayed to them.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.AddE2eeMemberResponse> addE2eeMember(
        patches.v1.E2Ee.AddE2eeMemberRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAddE2eeMemberMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Removes one member (a member removing themselves is a leave). The transition is a
     * device-signed group-control event that establishes the next membership epoch, and the
     * removed member's devices are excluded from every later fanout: a send composed under the
     * old epoch is rejected rather than delivered to them (ADR 0020 §7).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.RemoveE2eeMemberResponse> removeE2eeMember(
        patches.v1.E2Ee.RemoveE2eeMemberRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRemoveE2eeMemberMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The group-control transcript from the caller's last verified epoch forward, so a client
     * verifies the membership hash chain itself instead of trusting the node's current-epoch
     * claim — the conversation-level counterpart of `ListDeviceRosters` (ADR 0020 §7).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.ListE2eeGroupControlEventsResponse> listE2eeGroupControlEvents(
        patches.v1.E2Ee.ListE2eeGroupControlEventsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListE2eeGroupControlEventsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Accepts one logical message as one bounded, all-or-nothing per-device fanout, and returns
     * the node's franking tag over it (ADR 0020 §7, §9).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.SendEnvelopesResponse> sendEnvelopes(
        patches.v1.E2Ee.SendEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getSendEnvelopesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The calling device's mailbox, oldest first, keyset-paginated. Poll-based like every other
     * Patches delivery path (spec §183.3) — there is no push and no stream.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.ListMailboxEnvelopesResponse> listMailboxEnvelopes(
        patches.v1.E2Ee.ListMailboxEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListMailboxEnvelopesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Acknowledges envelopes the calling device has durably committed. An acknowledgement lets
     * the node clean the mailbox; it is never surfaced to the sender as a read receipt, which
     * spec §183.3 and §194 both prohibit.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.AcknowledgeEnvelopesResponse> acknowledgeEnvelopes(
        patches.v1.E2Ee.AcknowledgeEnvelopesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAcknowledgeEnvelopesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Attaches reporter-disclosed evidence to a report created by `ModerationService.CreateReport`.
     * The node verifies the franking commitment and its own tag. It never decrypts anything.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.E2Ee.AttachReportEvidenceResponse> attachReportEvidence(
        patches.v1.E2Ee.AttachReportEvidenceRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAttachReportEvidenceMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_GET_E2EE_CAPABILITY = 0;
  private static final int METHODID_PUBLISH_IDENTITY_ROOT = 1;
  private static final int METHODID_GET_IDENTITY_ROOT = 2;
  private static final int METHODID_ENROLL_DEVICE = 3;
  private static final int METHODID_REVOKE_DEVICE = 4;
  private static final int METHODID_PUBLISH_DEVICE_ROSTER = 5;
  private static final int METHODID_GET_DEVICE_ROSTER = 6;
  private static final int METHODID_LIST_DEVICE_ROSTERS = 7;
  private static final int METHODID_UPLOAD_PREKEYS = 8;
  private static final int METHODID_GET_PREKEY_INVENTORY = 9;
  private static final int METHODID_CLAIM_PREKEY_BUNDLES = 10;
  private static final int METHODID_CREATE_E2EE_CONVERSATION = 11;
  private static final int METHODID_GET_E2EE_CONVERSATION_STATE = 12;
  private static final int METHODID_ADD_E2EE_MEMBER = 13;
  private static final int METHODID_REMOVE_E2EE_MEMBER = 14;
  private static final int METHODID_LIST_E2EE_GROUP_CONTROL_EVENTS = 15;
  private static final int METHODID_SEND_ENVELOPES = 16;
  private static final int METHODID_LIST_MAILBOX_ENVELOPES = 17;
  private static final int METHODID_ACKNOWLEDGE_ENVELOPES = 18;
  private static final int METHODID_ATTACH_REPORT_EVIDENCE = 19;

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
        case METHODID_GET_E2EE_CAPABILITY:
          serviceImpl.getE2eeCapability((patches.v1.E2Ee.GetE2eeCapabilityRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetE2eeCapabilityResponse>) responseObserver);
          break;
        case METHODID_PUBLISH_IDENTITY_ROOT:
          serviceImpl.publishIdentityRoot((patches.v1.E2Ee.PublishIdentityRootRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.PublishIdentityRootResponse>) responseObserver);
          break;
        case METHODID_GET_IDENTITY_ROOT:
          serviceImpl.getIdentityRoot((patches.v1.E2Ee.GetIdentityRootRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetIdentityRootResponse>) responseObserver);
          break;
        case METHODID_ENROLL_DEVICE:
          serviceImpl.enrollDevice((patches.v1.E2Ee.EnrollDeviceRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.EnrollDeviceResponse>) responseObserver);
          break;
        case METHODID_REVOKE_DEVICE:
          serviceImpl.revokeDevice((patches.v1.E2Ee.RevokeDeviceRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.RevokeDeviceResponse>) responseObserver);
          break;
        case METHODID_PUBLISH_DEVICE_ROSTER:
          serviceImpl.publishDeviceRoster((patches.v1.E2Ee.PublishDeviceRosterRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.PublishDeviceRosterResponse>) responseObserver);
          break;
        case METHODID_GET_DEVICE_ROSTER:
          serviceImpl.getDeviceRoster((patches.v1.E2Ee.GetDeviceRosterRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetDeviceRosterResponse>) responseObserver);
          break;
        case METHODID_LIST_DEVICE_ROSTERS:
          serviceImpl.listDeviceRosters((patches.v1.E2Ee.ListDeviceRostersRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListDeviceRostersResponse>) responseObserver);
          break;
        case METHODID_UPLOAD_PREKEYS:
          serviceImpl.uploadPrekeys((patches.v1.E2Ee.UploadPrekeysRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.UploadPrekeysResponse>) responseObserver);
          break;
        case METHODID_GET_PREKEY_INVENTORY:
          serviceImpl.getPrekeyInventory((patches.v1.E2Ee.GetPrekeyInventoryRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetPrekeyInventoryResponse>) responseObserver);
          break;
        case METHODID_CLAIM_PREKEY_BUNDLES:
          serviceImpl.claimPrekeyBundles((patches.v1.E2Ee.ClaimPrekeyBundlesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.ClaimPrekeyBundlesResponse>) responseObserver);
          break;
        case METHODID_CREATE_E2EE_CONVERSATION:
          serviceImpl.createE2eeConversation((patches.v1.E2Ee.CreateE2eeConversationRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.CreateE2eeConversationResponse>) responseObserver);
          break;
        case METHODID_GET_E2EE_CONVERSATION_STATE:
          serviceImpl.getE2eeConversationState((patches.v1.E2Ee.GetE2eeConversationStateRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.GetE2eeConversationStateResponse>) responseObserver);
          break;
        case METHODID_ADD_E2EE_MEMBER:
          serviceImpl.addE2eeMember((patches.v1.E2Ee.AddE2eeMemberRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.AddE2eeMemberResponse>) responseObserver);
          break;
        case METHODID_REMOVE_E2EE_MEMBER:
          serviceImpl.removeE2eeMember((patches.v1.E2Ee.RemoveE2eeMemberRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.RemoveE2eeMemberResponse>) responseObserver);
          break;
        case METHODID_LIST_E2EE_GROUP_CONTROL_EVENTS:
          serviceImpl.listE2eeGroupControlEvents((patches.v1.E2Ee.ListE2eeGroupControlEventsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListE2eeGroupControlEventsResponse>) responseObserver);
          break;
        case METHODID_SEND_ENVELOPES:
          serviceImpl.sendEnvelopes((patches.v1.E2Ee.SendEnvelopesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.SendEnvelopesResponse>) responseObserver);
          break;
        case METHODID_LIST_MAILBOX_ENVELOPES:
          serviceImpl.listMailboxEnvelopes((patches.v1.E2Ee.ListMailboxEnvelopesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.ListMailboxEnvelopesResponse>) responseObserver);
          break;
        case METHODID_ACKNOWLEDGE_ENVELOPES:
          serviceImpl.acknowledgeEnvelopes((patches.v1.E2Ee.AcknowledgeEnvelopesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.AcknowledgeEnvelopesResponse>) responseObserver);
          break;
        case METHODID_ATTACH_REPORT_EVIDENCE:
          serviceImpl.attachReportEvidence((patches.v1.E2Ee.AttachReportEvidenceRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.E2Ee.AttachReportEvidenceResponse>) responseObserver);
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
          getGetE2eeCapabilityMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.GetE2eeCapabilityRequest,
              patches.v1.E2Ee.GetE2eeCapabilityResponse>(
                service, METHODID_GET_E2EE_CAPABILITY)))
        .addMethod(
          getPublishIdentityRootMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.PublishIdentityRootRequest,
              patches.v1.E2Ee.PublishIdentityRootResponse>(
                service, METHODID_PUBLISH_IDENTITY_ROOT)))
        .addMethod(
          getGetIdentityRootMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.GetIdentityRootRequest,
              patches.v1.E2Ee.GetIdentityRootResponse>(
                service, METHODID_GET_IDENTITY_ROOT)))
        .addMethod(
          getEnrollDeviceMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.EnrollDeviceRequest,
              patches.v1.E2Ee.EnrollDeviceResponse>(
                service, METHODID_ENROLL_DEVICE)))
        .addMethod(
          getRevokeDeviceMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.RevokeDeviceRequest,
              patches.v1.E2Ee.RevokeDeviceResponse>(
                service, METHODID_REVOKE_DEVICE)))
        .addMethod(
          getPublishDeviceRosterMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.PublishDeviceRosterRequest,
              patches.v1.E2Ee.PublishDeviceRosterResponse>(
                service, METHODID_PUBLISH_DEVICE_ROSTER)))
        .addMethod(
          getGetDeviceRosterMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.GetDeviceRosterRequest,
              patches.v1.E2Ee.GetDeviceRosterResponse>(
                service, METHODID_GET_DEVICE_ROSTER)))
        .addMethod(
          getListDeviceRostersMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.ListDeviceRostersRequest,
              patches.v1.E2Ee.ListDeviceRostersResponse>(
                service, METHODID_LIST_DEVICE_ROSTERS)))
        .addMethod(
          getUploadPrekeysMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.UploadPrekeysRequest,
              patches.v1.E2Ee.UploadPrekeysResponse>(
                service, METHODID_UPLOAD_PREKEYS)))
        .addMethod(
          getGetPrekeyInventoryMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.GetPrekeyInventoryRequest,
              patches.v1.E2Ee.GetPrekeyInventoryResponse>(
                service, METHODID_GET_PREKEY_INVENTORY)))
        .addMethod(
          getClaimPrekeyBundlesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.ClaimPrekeyBundlesRequest,
              patches.v1.E2Ee.ClaimPrekeyBundlesResponse>(
                service, METHODID_CLAIM_PREKEY_BUNDLES)))
        .addMethod(
          getCreateE2eeConversationMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.CreateE2eeConversationRequest,
              patches.v1.E2Ee.CreateE2eeConversationResponse>(
                service, METHODID_CREATE_E2EE_CONVERSATION)))
        .addMethod(
          getGetE2eeConversationStateMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.GetE2eeConversationStateRequest,
              patches.v1.E2Ee.GetE2eeConversationStateResponse>(
                service, METHODID_GET_E2EE_CONVERSATION_STATE)))
        .addMethod(
          getAddE2eeMemberMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.AddE2eeMemberRequest,
              patches.v1.E2Ee.AddE2eeMemberResponse>(
                service, METHODID_ADD_E2EE_MEMBER)))
        .addMethod(
          getRemoveE2eeMemberMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.RemoveE2eeMemberRequest,
              patches.v1.E2Ee.RemoveE2eeMemberResponse>(
                service, METHODID_REMOVE_E2EE_MEMBER)))
        .addMethod(
          getListE2eeGroupControlEventsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.ListE2eeGroupControlEventsRequest,
              patches.v1.E2Ee.ListE2eeGroupControlEventsResponse>(
                service, METHODID_LIST_E2EE_GROUP_CONTROL_EVENTS)))
        .addMethod(
          getSendEnvelopesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.SendEnvelopesRequest,
              patches.v1.E2Ee.SendEnvelopesResponse>(
                service, METHODID_SEND_ENVELOPES)))
        .addMethod(
          getListMailboxEnvelopesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.ListMailboxEnvelopesRequest,
              patches.v1.E2Ee.ListMailboxEnvelopesResponse>(
                service, METHODID_LIST_MAILBOX_ENVELOPES)))
        .addMethod(
          getAcknowledgeEnvelopesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.AcknowledgeEnvelopesRequest,
              patches.v1.E2Ee.AcknowledgeEnvelopesResponse>(
                service, METHODID_ACKNOWLEDGE_ENVELOPES)))
        .addMethod(
          getAttachReportEvidenceMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.E2Ee.AttachReportEvidenceRequest,
              patches.v1.E2Ee.AttachReportEvidenceResponse>(
                service, METHODID_ATTACH_REPORT_EVIDENCE)))
        .build();
  }

  private static abstract class E2eeServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    E2eeServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.E2Ee.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("E2eeService");
    }
  }

  private static final class E2eeServiceFileDescriptorSupplier
      extends E2eeServiceBaseDescriptorSupplier {
    E2eeServiceFileDescriptorSupplier() {}
  }

  private static final class E2eeServiceMethodDescriptorSupplier
      extends E2eeServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    E2eeServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (E2eeServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new E2eeServiceFileDescriptorSupplier())
              .addMethod(getGetE2eeCapabilityMethod())
              .addMethod(getPublishIdentityRootMethod())
              .addMethod(getGetIdentityRootMethod())
              .addMethod(getEnrollDeviceMethod())
              .addMethod(getRevokeDeviceMethod())
              .addMethod(getPublishDeviceRosterMethod())
              .addMethod(getGetDeviceRosterMethod())
              .addMethod(getListDeviceRostersMethod())
              .addMethod(getUploadPrekeysMethod())
              .addMethod(getGetPrekeyInventoryMethod())
              .addMethod(getClaimPrekeyBundlesMethod())
              .addMethod(getCreateE2eeConversationMethod())
              .addMethod(getGetE2eeConversationStateMethod())
              .addMethod(getAddE2eeMemberMethod())
              .addMethod(getRemoveE2eeMemberMethod())
              .addMethod(getListE2eeGroupControlEventsMethod())
              .addMethod(getSendEnvelopesMethod())
              .addMethod(getListMailboxEnvelopesMethod())
              .addMethod(getAcknowledgeEnvelopesMethod())
              .addMethod(getAttachReportEvidenceMethod())
              .build();
        }
      }
    }
    return result;
  }
}
