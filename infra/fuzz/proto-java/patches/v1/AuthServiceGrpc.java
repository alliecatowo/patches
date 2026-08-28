package patches.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Local account authentication and credential management (spec §33–39, §48, and Amendment A
 * §162, §165–168). Session issuance/rotation only — `ActorService` owns profile data,
 * `SocialGraphService` owns follow/mute/block state.
 * A credential proves you are a user; it is not who you are (§165). One user account may
 * hold several credentials (password, SSH keys, GitHub) side by side, and every login RPC
 * below returns the same `Session` envelope regardless of which credential was used.
 * </pre>
 */
@javax.annotation.Generated(
    value = "by gRPC proto compiler (version 1.71.0)",
    comments = "Source: patches/v1/auth.proto")
@io.grpc.stub.annotations.GrpcGenerated
public final class AuthServiceGrpc {

  private AuthServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "patches.v1.AuthService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.GetAuthPolicyRequest,
      patches.v1.Auth.GetAuthPolicyResponse> getGetAuthPolicyMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetAuthPolicy",
      requestType = patches.v1.Auth.GetAuthPolicyRequest.class,
      responseType = patches.v1.Auth.GetAuthPolicyResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.GetAuthPolicyRequest,
      patches.v1.Auth.GetAuthPolicyResponse> getGetAuthPolicyMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.GetAuthPolicyRequest, patches.v1.Auth.GetAuthPolicyResponse> getGetAuthPolicyMethod;
    if ((getGetAuthPolicyMethod = AuthServiceGrpc.getGetAuthPolicyMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getGetAuthPolicyMethod = AuthServiceGrpc.getGetAuthPolicyMethod) == null) {
          AuthServiceGrpc.getGetAuthPolicyMethod = getGetAuthPolicyMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.GetAuthPolicyRequest, patches.v1.Auth.GetAuthPolicyResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetAuthPolicy"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.GetAuthPolicyRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.GetAuthPolicyResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("GetAuthPolicy"))
              .build();
        }
      }
    }
    return getGetAuthPolicyMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.RegisterRequest,
      patches.v1.Auth.RegisterResponse> getRegisterMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "Register",
      requestType = patches.v1.Auth.RegisterRequest.class,
      responseType = patches.v1.Auth.RegisterResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.RegisterRequest,
      patches.v1.Auth.RegisterResponse> getRegisterMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.RegisterRequest, patches.v1.Auth.RegisterResponse> getRegisterMethod;
    if ((getRegisterMethod = AuthServiceGrpc.getRegisterMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getRegisterMethod = AuthServiceGrpc.getRegisterMethod) == null) {
          AuthServiceGrpc.getRegisterMethod = getRegisterMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.RegisterRequest, patches.v1.Auth.RegisterResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "Register"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RegisterRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RegisterResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("Register"))
              .build();
        }
      }
    }
    return getRegisterMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.VerifyEmailRequest,
      patches.v1.Auth.VerifyEmailResponse> getVerifyEmailMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "VerifyEmail",
      requestType = patches.v1.Auth.VerifyEmailRequest.class,
      responseType = patches.v1.Auth.VerifyEmailResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.VerifyEmailRequest,
      patches.v1.Auth.VerifyEmailResponse> getVerifyEmailMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.VerifyEmailRequest, patches.v1.Auth.VerifyEmailResponse> getVerifyEmailMethod;
    if ((getVerifyEmailMethod = AuthServiceGrpc.getVerifyEmailMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getVerifyEmailMethod = AuthServiceGrpc.getVerifyEmailMethod) == null) {
          AuthServiceGrpc.getVerifyEmailMethod = getVerifyEmailMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.VerifyEmailRequest, patches.v1.Auth.VerifyEmailResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "VerifyEmail"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.VerifyEmailRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.VerifyEmailResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("VerifyEmail"))
              .build();
        }
      }
    }
    return getVerifyEmailMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.ResendVerificationRequest,
      patches.v1.Auth.ResendVerificationResponse> getResendVerificationMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ResendVerification",
      requestType = patches.v1.Auth.ResendVerificationRequest.class,
      responseType = patches.v1.Auth.ResendVerificationResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.ResendVerificationRequest,
      patches.v1.Auth.ResendVerificationResponse> getResendVerificationMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.ResendVerificationRequest, patches.v1.Auth.ResendVerificationResponse> getResendVerificationMethod;
    if ((getResendVerificationMethod = AuthServiceGrpc.getResendVerificationMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getResendVerificationMethod = AuthServiceGrpc.getResendVerificationMethod) == null) {
          AuthServiceGrpc.getResendVerificationMethod = getResendVerificationMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.ResendVerificationRequest, patches.v1.Auth.ResendVerificationResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ResendVerification"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ResendVerificationRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ResendVerificationResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("ResendVerification"))
              .build();
        }
      }
    }
    return getResendVerificationMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.LoginRequest,
      patches.v1.Auth.LoginResponse> getLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "Login",
      requestType = patches.v1.Auth.LoginRequest.class,
      responseType = patches.v1.Auth.LoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.LoginRequest,
      patches.v1.Auth.LoginResponse> getLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.LoginRequest, patches.v1.Auth.LoginResponse> getLoginMethod;
    if ((getLoginMethod = AuthServiceGrpc.getLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getLoginMethod = AuthServiceGrpc.getLoginMethod) == null) {
          AuthServiceGrpc.getLoginMethod = getLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.LoginRequest, patches.v1.Auth.LoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "Login"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.LoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.LoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("Login"))
              .build();
        }
      }
    }
    return getLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.RefreshSessionRequest,
      patches.v1.Auth.RefreshSessionResponse> getRefreshSessionMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RefreshSession",
      requestType = patches.v1.Auth.RefreshSessionRequest.class,
      responseType = patches.v1.Auth.RefreshSessionResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.RefreshSessionRequest,
      patches.v1.Auth.RefreshSessionResponse> getRefreshSessionMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.RefreshSessionRequest, patches.v1.Auth.RefreshSessionResponse> getRefreshSessionMethod;
    if ((getRefreshSessionMethod = AuthServiceGrpc.getRefreshSessionMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getRefreshSessionMethod = AuthServiceGrpc.getRefreshSessionMethod) == null) {
          AuthServiceGrpc.getRefreshSessionMethod = getRefreshSessionMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.RefreshSessionRequest, patches.v1.Auth.RefreshSessionResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RefreshSession"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RefreshSessionRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RefreshSessionResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("RefreshSession"))
              .build();
        }
      }
    }
    return getRefreshSessionMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.LogoutRequest,
      patches.v1.Auth.LogoutResponse> getLogoutMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "Logout",
      requestType = patches.v1.Auth.LogoutRequest.class,
      responseType = patches.v1.Auth.LogoutResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.LogoutRequest,
      patches.v1.Auth.LogoutResponse> getLogoutMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.LogoutRequest, patches.v1.Auth.LogoutResponse> getLogoutMethod;
    if ((getLogoutMethod = AuthServiceGrpc.getLogoutMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getLogoutMethod = AuthServiceGrpc.getLogoutMethod) == null) {
          AuthServiceGrpc.getLogoutMethod = getLogoutMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.LogoutRequest, patches.v1.Auth.LogoutResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "Logout"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.LogoutRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.LogoutResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("Logout"))
              .build();
        }
      }
    }
    return getLogoutMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.LogoutAllSessionsRequest,
      patches.v1.Auth.LogoutAllSessionsResponse> getLogoutAllSessionsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "LogoutAllSessions",
      requestType = patches.v1.Auth.LogoutAllSessionsRequest.class,
      responseType = patches.v1.Auth.LogoutAllSessionsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.LogoutAllSessionsRequest,
      patches.v1.Auth.LogoutAllSessionsResponse> getLogoutAllSessionsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.LogoutAllSessionsRequest, patches.v1.Auth.LogoutAllSessionsResponse> getLogoutAllSessionsMethod;
    if ((getLogoutAllSessionsMethod = AuthServiceGrpc.getLogoutAllSessionsMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getLogoutAllSessionsMethod = AuthServiceGrpc.getLogoutAllSessionsMethod) == null) {
          AuthServiceGrpc.getLogoutAllSessionsMethod = getLogoutAllSessionsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.LogoutAllSessionsRequest, patches.v1.Auth.LogoutAllSessionsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "LogoutAllSessions"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.LogoutAllSessionsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.LogoutAllSessionsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("LogoutAllSessions"))
              .build();
        }
      }
    }
    return getLogoutAllSessionsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.RequestPasswordResetRequest,
      patches.v1.Auth.RequestPasswordResetResponse> getRequestPasswordResetMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RequestPasswordReset",
      requestType = patches.v1.Auth.RequestPasswordResetRequest.class,
      responseType = patches.v1.Auth.RequestPasswordResetResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.RequestPasswordResetRequest,
      patches.v1.Auth.RequestPasswordResetResponse> getRequestPasswordResetMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.RequestPasswordResetRequest, patches.v1.Auth.RequestPasswordResetResponse> getRequestPasswordResetMethod;
    if ((getRequestPasswordResetMethod = AuthServiceGrpc.getRequestPasswordResetMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getRequestPasswordResetMethod = AuthServiceGrpc.getRequestPasswordResetMethod) == null) {
          AuthServiceGrpc.getRequestPasswordResetMethod = getRequestPasswordResetMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.RequestPasswordResetRequest, patches.v1.Auth.RequestPasswordResetResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RequestPasswordReset"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RequestPasswordResetRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RequestPasswordResetResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("RequestPasswordReset"))
              .build();
        }
      }
    }
    return getRequestPasswordResetMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.ResetPasswordRequest,
      patches.v1.Auth.ResetPasswordResponse> getResetPasswordMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ResetPassword",
      requestType = patches.v1.Auth.ResetPasswordRequest.class,
      responseType = patches.v1.Auth.ResetPasswordResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.ResetPasswordRequest,
      patches.v1.Auth.ResetPasswordResponse> getResetPasswordMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.ResetPasswordRequest, patches.v1.Auth.ResetPasswordResponse> getResetPasswordMethod;
    if ((getResetPasswordMethod = AuthServiceGrpc.getResetPasswordMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getResetPasswordMethod = AuthServiceGrpc.getResetPasswordMethod) == null) {
          AuthServiceGrpc.getResetPasswordMethod = getResetPasswordMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.ResetPasswordRequest, patches.v1.Auth.ResetPasswordResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ResetPassword"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ResetPasswordRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ResetPasswordResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("ResetPassword"))
              .build();
        }
      }
    }
    return getResetPasswordMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.GetCurrentSessionRequest,
      patches.v1.Auth.GetCurrentSessionResponse> getGetCurrentSessionMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GetCurrentSession",
      requestType = patches.v1.Auth.GetCurrentSessionRequest.class,
      responseType = patches.v1.Auth.GetCurrentSessionResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.GetCurrentSessionRequest,
      patches.v1.Auth.GetCurrentSessionResponse> getGetCurrentSessionMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.GetCurrentSessionRequest, patches.v1.Auth.GetCurrentSessionResponse> getGetCurrentSessionMethod;
    if ((getGetCurrentSessionMethod = AuthServiceGrpc.getGetCurrentSessionMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getGetCurrentSessionMethod = AuthServiceGrpc.getGetCurrentSessionMethod) == null) {
          AuthServiceGrpc.getGetCurrentSessionMethod = getGetCurrentSessionMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.GetCurrentSessionRequest, patches.v1.Auth.GetCurrentSessionResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GetCurrentSession"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.GetCurrentSessionRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.GetCurrentSessionResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("GetCurrentSession"))
              .build();
        }
      }
    }
    return getGetCurrentSessionMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.BeginSshLoginRequest,
      patches.v1.Auth.BeginSshLoginResponse> getBeginSshLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginSshLogin",
      requestType = patches.v1.Auth.BeginSshLoginRequest.class,
      responseType = patches.v1.Auth.BeginSshLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.BeginSshLoginRequest,
      patches.v1.Auth.BeginSshLoginResponse> getBeginSshLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.BeginSshLoginRequest, patches.v1.Auth.BeginSshLoginResponse> getBeginSshLoginMethod;
    if ((getBeginSshLoginMethod = AuthServiceGrpc.getBeginSshLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getBeginSshLoginMethod = AuthServiceGrpc.getBeginSshLoginMethod) == null) {
          AuthServiceGrpc.getBeginSshLoginMethod = getBeginSshLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.BeginSshLoginRequest, patches.v1.Auth.BeginSshLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginSshLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginSshLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginSshLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("BeginSshLogin"))
              .build();
        }
      }
    }
    return getBeginSshLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.CompleteSshLoginRequest,
      patches.v1.Auth.CompleteSshLoginResponse> getCompleteSshLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CompleteSshLogin",
      requestType = patches.v1.Auth.CompleteSshLoginRequest.class,
      responseType = patches.v1.Auth.CompleteSshLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.CompleteSshLoginRequest,
      patches.v1.Auth.CompleteSshLoginResponse> getCompleteSshLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.CompleteSshLoginRequest, patches.v1.Auth.CompleteSshLoginResponse> getCompleteSshLoginMethod;
    if ((getCompleteSshLoginMethod = AuthServiceGrpc.getCompleteSshLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getCompleteSshLoginMethod = AuthServiceGrpc.getCompleteSshLoginMethod) == null) {
          AuthServiceGrpc.getCompleteSshLoginMethod = getCompleteSshLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.CompleteSshLoginRequest, patches.v1.Auth.CompleteSshLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CompleteSshLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.CompleteSshLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.CompleteSshLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("CompleteSshLogin"))
              .build();
        }
      }
    }
    return getCompleteSshLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.BeginGitHubLoginRequest,
      patches.v1.Auth.BeginGitHubLoginResponse> getBeginGitHubLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginGitHubLogin",
      requestType = patches.v1.Auth.BeginGitHubLoginRequest.class,
      responseType = patches.v1.Auth.BeginGitHubLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.BeginGitHubLoginRequest,
      patches.v1.Auth.BeginGitHubLoginResponse> getBeginGitHubLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.BeginGitHubLoginRequest, patches.v1.Auth.BeginGitHubLoginResponse> getBeginGitHubLoginMethod;
    if ((getBeginGitHubLoginMethod = AuthServiceGrpc.getBeginGitHubLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getBeginGitHubLoginMethod = AuthServiceGrpc.getBeginGitHubLoginMethod) == null) {
          AuthServiceGrpc.getBeginGitHubLoginMethod = getBeginGitHubLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.BeginGitHubLoginRequest, patches.v1.Auth.BeginGitHubLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginGitHubLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginGitHubLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginGitHubLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("BeginGitHubLogin"))
              .build();
        }
      }
    }
    return getBeginGitHubLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.PollGitHubLoginRequest,
      patches.v1.Auth.PollGitHubLoginResponse> getPollGitHubLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PollGitHubLogin",
      requestType = patches.v1.Auth.PollGitHubLoginRequest.class,
      responseType = patches.v1.Auth.PollGitHubLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.PollGitHubLoginRequest,
      patches.v1.Auth.PollGitHubLoginResponse> getPollGitHubLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.PollGitHubLoginRequest, patches.v1.Auth.PollGitHubLoginResponse> getPollGitHubLoginMethod;
    if ((getPollGitHubLoginMethod = AuthServiceGrpc.getPollGitHubLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getPollGitHubLoginMethod = AuthServiceGrpc.getPollGitHubLoginMethod) == null) {
          AuthServiceGrpc.getPollGitHubLoginMethod = getPollGitHubLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.PollGitHubLoginRequest, patches.v1.Auth.PollGitHubLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PollGitHubLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.PollGitHubLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.PollGitHubLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("PollGitHubLogin"))
              .build();
        }
      }
    }
    return getPollGitHubLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.BeginOidcLoginRequest,
      patches.v1.Auth.BeginOidcLoginResponse> getBeginOidcLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginOidcLogin",
      requestType = patches.v1.Auth.BeginOidcLoginRequest.class,
      responseType = patches.v1.Auth.BeginOidcLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.BeginOidcLoginRequest,
      patches.v1.Auth.BeginOidcLoginResponse> getBeginOidcLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.BeginOidcLoginRequest, patches.v1.Auth.BeginOidcLoginResponse> getBeginOidcLoginMethod;
    if ((getBeginOidcLoginMethod = AuthServiceGrpc.getBeginOidcLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getBeginOidcLoginMethod = AuthServiceGrpc.getBeginOidcLoginMethod) == null) {
          AuthServiceGrpc.getBeginOidcLoginMethod = getBeginOidcLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.BeginOidcLoginRequest, patches.v1.Auth.BeginOidcLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginOidcLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginOidcLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginOidcLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("BeginOidcLogin"))
              .build();
        }
      }
    }
    return getBeginOidcLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.PollOidcLoginRequest,
      patches.v1.Auth.PollOidcLoginResponse> getPollOidcLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PollOidcLogin",
      requestType = patches.v1.Auth.PollOidcLoginRequest.class,
      responseType = patches.v1.Auth.PollOidcLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.PollOidcLoginRequest,
      patches.v1.Auth.PollOidcLoginResponse> getPollOidcLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.PollOidcLoginRequest, patches.v1.Auth.PollOidcLoginResponse> getPollOidcLoginMethod;
    if ((getPollOidcLoginMethod = AuthServiceGrpc.getPollOidcLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getPollOidcLoginMethod = AuthServiceGrpc.getPollOidcLoginMethod) == null) {
          AuthServiceGrpc.getPollOidcLoginMethod = getPollOidcLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.PollOidcLoginRequest, patches.v1.Auth.PollOidcLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PollOidcLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.PollOidcLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.PollOidcLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("PollOidcLogin"))
              .build();
        }
      }
    }
    return getPollOidcLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.BeginDeviceLinkRequest,
      patches.v1.Auth.BeginDeviceLinkResponse> getBeginDeviceLinkMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginDeviceLink",
      requestType = patches.v1.Auth.BeginDeviceLinkRequest.class,
      responseType = patches.v1.Auth.BeginDeviceLinkResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.BeginDeviceLinkRequest,
      patches.v1.Auth.BeginDeviceLinkResponse> getBeginDeviceLinkMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.BeginDeviceLinkRequest, patches.v1.Auth.BeginDeviceLinkResponse> getBeginDeviceLinkMethod;
    if ((getBeginDeviceLinkMethod = AuthServiceGrpc.getBeginDeviceLinkMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getBeginDeviceLinkMethod = AuthServiceGrpc.getBeginDeviceLinkMethod) == null) {
          AuthServiceGrpc.getBeginDeviceLinkMethod = getBeginDeviceLinkMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.BeginDeviceLinkRequest, patches.v1.Auth.BeginDeviceLinkResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginDeviceLink"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginDeviceLinkRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginDeviceLinkResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("BeginDeviceLink"))
              .build();
        }
      }
    }
    return getBeginDeviceLinkMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.PollDeviceLinkRequest,
      patches.v1.Auth.PollDeviceLinkResponse> getPollDeviceLinkMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "PollDeviceLink",
      requestType = patches.v1.Auth.PollDeviceLinkRequest.class,
      responseType = patches.v1.Auth.PollDeviceLinkResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.PollDeviceLinkRequest,
      patches.v1.Auth.PollDeviceLinkResponse> getPollDeviceLinkMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.PollDeviceLinkRequest, patches.v1.Auth.PollDeviceLinkResponse> getPollDeviceLinkMethod;
    if ((getPollDeviceLinkMethod = AuthServiceGrpc.getPollDeviceLinkMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getPollDeviceLinkMethod = AuthServiceGrpc.getPollDeviceLinkMethod) == null) {
          AuthServiceGrpc.getPollDeviceLinkMethod = getPollDeviceLinkMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.PollDeviceLinkRequest, patches.v1.Auth.PollDeviceLinkResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "PollDeviceLink"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.PollDeviceLinkRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.PollDeviceLinkResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("PollDeviceLink"))
              .build();
        }
      }
    }
    return getPollDeviceLinkMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.ApproveDeviceLinkRequest,
      patches.v1.Auth.ApproveDeviceLinkResponse> getApproveDeviceLinkMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ApproveDeviceLink",
      requestType = patches.v1.Auth.ApproveDeviceLinkRequest.class,
      responseType = patches.v1.Auth.ApproveDeviceLinkResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.ApproveDeviceLinkRequest,
      patches.v1.Auth.ApproveDeviceLinkResponse> getApproveDeviceLinkMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.ApproveDeviceLinkRequest, patches.v1.Auth.ApproveDeviceLinkResponse> getApproveDeviceLinkMethod;
    if ((getApproveDeviceLinkMethod = AuthServiceGrpc.getApproveDeviceLinkMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getApproveDeviceLinkMethod = AuthServiceGrpc.getApproveDeviceLinkMethod) == null) {
          AuthServiceGrpc.getApproveDeviceLinkMethod = getApproveDeviceLinkMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.ApproveDeviceLinkRequest, patches.v1.Auth.ApproveDeviceLinkResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ApproveDeviceLink"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ApproveDeviceLinkRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ApproveDeviceLinkResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("ApproveDeviceLink"))
              .build();
        }
      }
    }
    return getApproveDeviceLinkMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.ListCredentialsRequest,
      patches.v1.Auth.ListCredentialsResponse> getListCredentialsMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "ListCredentials",
      requestType = patches.v1.Auth.ListCredentialsRequest.class,
      responseType = patches.v1.Auth.ListCredentialsResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.ListCredentialsRequest,
      patches.v1.Auth.ListCredentialsResponse> getListCredentialsMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.ListCredentialsRequest, patches.v1.Auth.ListCredentialsResponse> getListCredentialsMethod;
    if ((getListCredentialsMethod = AuthServiceGrpc.getListCredentialsMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getListCredentialsMethod = AuthServiceGrpc.getListCredentialsMethod) == null) {
          AuthServiceGrpc.getListCredentialsMethod = getListCredentialsMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.ListCredentialsRequest, patches.v1.Auth.ListCredentialsResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "ListCredentials"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ListCredentialsRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.ListCredentialsResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("ListCredentials"))
              .build();
        }
      }
    }
    return getListCredentialsMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.BeginSshEnrollmentRequest,
      patches.v1.Auth.BeginSshEnrollmentResponse> getBeginSshEnrollmentMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginSshEnrollment",
      requestType = patches.v1.Auth.BeginSshEnrollmentRequest.class,
      responseType = patches.v1.Auth.BeginSshEnrollmentResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.BeginSshEnrollmentRequest,
      patches.v1.Auth.BeginSshEnrollmentResponse> getBeginSshEnrollmentMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.BeginSshEnrollmentRequest, patches.v1.Auth.BeginSshEnrollmentResponse> getBeginSshEnrollmentMethod;
    if ((getBeginSshEnrollmentMethod = AuthServiceGrpc.getBeginSshEnrollmentMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getBeginSshEnrollmentMethod = AuthServiceGrpc.getBeginSshEnrollmentMethod) == null) {
          AuthServiceGrpc.getBeginSshEnrollmentMethod = getBeginSshEnrollmentMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.BeginSshEnrollmentRequest, patches.v1.Auth.BeginSshEnrollmentResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginSshEnrollment"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginSshEnrollmentRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginSshEnrollmentResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("BeginSshEnrollment"))
              .build();
        }
      }
    }
    return getBeginSshEnrollmentMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.AddCredentialRequest,
      patches.v1.Auth.AddCredentialResponse> getAddCredentialMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "AddCredential",
      requestType = patches.v1.Auth.AddCredentialRequest.class,
      responseType = patches.v1.Auth.AddCredentialResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.AddCredentialRequest,
      patches.v1.Auth.AddCredentialResponse> getAddCredentialMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.AddCredentialRequest, patches.v1.Auth.AddCredentialResponse> getAddCredentialMethod;
    if ((getAddCredentialMethod = AuthServiceGrpc.getAddCredentialMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getAddCredentialMethod = AuthServiceGrpc.getAddCredentialMethod) == null) {
          AuthServiceGrpc.getAddCredentialMethod = getAddCredentialMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.AddCredentialRequest, patches.v1.Auth.AddCredentialResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "AddCredential"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.AddCredentialRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.AddCredentialResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("AddCredential"))
              .build();
        }
      }
    }
    return getAddCredentialMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.RevokeCredentialRequest,
      patches.v1.Auth.RevokeCredentialResponse> getRevokeCredentialMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RevokeCredential",
      requestType = patches.v1.Auth.RevokeCredentialRequest.class,
      responseType = patches.v1.Auth.RevokeCredentialResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.RevokeCredentialRequest,
      patches.v1.Auth.RevokeCredentialResponse> getRevokeCredentialMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.RevokeCredentialRequest, patches.v1.Auth.RevokeCredentialResponse> getRevokeCredentialMethod;
    if ((getRevokeCredentialMethod = AuthServiceGrpc.getRevokeCredentialMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getRevokeCredentialMethod = AuthServiceGrpc.getRevokeCredentialMethod) == null) {
          AuthServiceGrpc.getRevokeCredentialMethod = getRevokeCredentialMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.RevokeCredentialRequest, patches.v1.Auth.RevokeCredentialResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RevokeCredential"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RevokeCredentialRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RevokeCredentialResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("RevokeCredential"))
              .build();
        }
      }
    }
    return getRevokeCredentialMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.GenerateRecoveryCodesRequest,
      patches.v1.Auth.GenerateRecoveryCodesResponse> getGenerateRecoveryCodesMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "GenerateRecoveryCodes",
      requestType = patches.v1.Auth.GenerateRecoveryCodesRequest.class,
      responseType = patches.v1.Auth.GenerateRecoveryCodesResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.GenerateRecoveryCodesRequest,
      patches.v1.Auth.GenerateRecoveryCodesResponse> getGenerateRecoveryCodesMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.GenerateRecoveryCodesRequest, patches.v1.Auth.GenerateRecoveryCodesResponse> getGenerateRecoveryCodesMethod;
    if ((getGenerateRecoveryCodesMethod = AuthServiceGrpc.getGenerateRecoveryCodesMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getGenerateRecoveryCodesMethod = AuthServiceGrpc.getGenerateRecoveryCodesMethod) == null) {
          AuthServiceGrpc.getGenerateRecoveryCodesMethod = getGenerateRecoveryCodesMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.GenerateRecoveryCodesRequest, patches.v1.Auth.GenerateRecoveryCodesResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "GenerateRecoveryCodes"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.GenerateRecoveryCodesRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.GenerateRecoveryCodesResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("GenerateRecoveryCodes"))
              .build();
        }
      }
    }
    return getGenerateRecoveryCodesMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.RecoveryLoginRequest,
      patches.v1.Auth.RecoveryLoginResponse> getRecoveryLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RecoveryLogin",
      requestType = patches.v1.Auth.RecoveryLoginRequest.class,
      responseType = patches.v1.Auth.RecoveryLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.RecoveryLoginRequest,
      patches.v1.Auth.RecoveryLoginResponse> getRecoveryLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.RecoveryLoginRequest, patches.v1.Auth.RecoveryLoginResponse> getRecoveryLoginMethod;
    if ((getRecoveryLoginMethod = AuthServiceGrpc.getRecoveryLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getRecoveryLoginMethod = AuthServiceGrpc.getRecoveryLoginMethod) == null) {
          AuthServiceGrpc.getRecoveryLoginMethod = getRecoveryLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.RecoveryLoginRequest, patches.v1.Auth.RecoveryLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RecoveryLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RecoveryLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.RecoveryLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("RecoveryLogin"))
              .build();
        }
      }
    }
    return getRecoveryLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.BeginPasskeyRegistrationRequest,
      patches.v1.Auth.BeginPasskeyRegistrationResponse> getBeginPasskeyRegistrationMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginPasskeyRegistration",
      requestType = patches.v1.Auth.BeginPasskeyRegistrationRequest.class,
      responseType = patches.v1.Auth.BeginPasskeyRegistrationResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.BeginPasskeyRegistrationRequest,
      patches.v1.Auth.BeginPasskeyRegistrationResponse> getBeginPasskeyRegistrationMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.BeginPasskeyRegistrationRequest, patches.v1.Auth.BeginPasskeyRegistrationResponse> getBeginPasskeyRegistrationMethod;
    if ((getBeginPasskeyRegistrationMethod = AuthServiceGrpc.getBeginPasskeyRegistrationMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getBeginPasskeyRegistrationMethod = AuthServiceGrpc.getBeginPasskeyRegistrationMethod) == null) {
          AuthServiceGrpc.getBeginPasskeyRegistrationMethod = getBeginPasskeyRegistrationMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.BeginPasskeyRegistrationRequest, patches.v1.Auth.BeginPasskeyRegistrationResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginPasskeyRegistration"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginPasskeyRegistrationRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginPasskeyRegistrationResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("BeginPasskeyRegistration"))
              .build();
        }
      }
    }
    return getBeginPasskeyRegistrationMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.CompletePasskeyRegistrationRequest,
      patches.v1.Auth.CompletePasskeyRegistrationResponse> getCompletePasskeyRegistrationMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CompletePasskeyRegistration",
      requestType = patches.v1.Auth.CompletePasskeyRegistrationRequest.class,
      responseType = patches.v1.Auth.CompletePasskeyRegistrationResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.CompletePasskeyRegistrationRequest,
      patches.v1.Auth.CompletePasskeyRegistrationResponse> getCompletePasskeyRegistrationMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.CompletePasskeyRegistrationRequest, patches.v1.Auth.CompletePasskeyRegistrationResponse> getCompletePasskeyRegistrationMethod;
    if ((getCompletePasskeyRegistrationMethod = AuthServiceGrpc.getCompletePasskeyRegistrationMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getCompletePasskeyRegistrationMethod = AuthServiceGrpc.getCompletePasskeyRegistrationMethod) == null) {
          AuthServiceGrpc.getCompletePasskeyRegistrationMethod = getCompletePasskeyRegistrationMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.CompletePasskeyRegistrationRequest, patches.v1.Auth.CompletePasskeyRegistrationResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CompletePasskeyRegistration"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.CompletePasskeyRegistrationRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.CompletePasskeyRegistrationResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("CompletePasskeyRegistration"))
              .build();
        }
      }
    }
    return getCompletePasskeyRegistrationMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.BeginPasskeyLoginRequest,
      patches.v1.Auth.BeginPasskeyLoginResponse> getBeginPasskeyLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "BeginPasskeyLogin",
      requestType = patches.v1.Auth.BeginPasskeyLoginRequest.class,
      responseType = patches.v1.Auth.BeginPasskeyLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.BeginPasskeyLoginRequest,
      patches.v1.Auth.BeginPasskeyLoginResponse> getBeginPasskeyLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.BeginPasskeyLoginRequest, patches.v1.Auth.BeginPasskeyLoginResponse> getBeginPasskeyLoginMethod;
    if ((getBeginPasskeyLoginMethod = AuthServiceGrpc.getBeginPasskeyLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getBeginPasskeyLoginMethod = AuthServiceGrpc.getBeginPasskeyLoginMethod) == null) {
          AuthServiceGrpc.getBeginPasskeyLoginMethod = getBeginPasskeyLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.BeginPasskeyLoginRequest, patches.v1.Auth.BeginPasskeyLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "BeginPasskeyLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginPasskeyLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.BeginPasskeyLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("BeginPasskeyLogin"))
              .build();
        }
      }
    }
    return getBeginPasskeyLoginMethod;
  }

  private static volatile io.grpc.MethodDescriptor<patches.v1.Auth.CompletePasskeyLoginRequest,
      patches.v1.Auth.CompletePasskeyLoginResponse> getCompletePasskeyLoginMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "CompletePasskeyLogin",
      requestType = patches.v1.Auth.CompletePasskeyLoginRequest.class,
      responseType = patches.v1.Auth.CompletePasskeyLoginResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<patches.v1.Auth.CompletePasskeyLoginRequest,
      patches.v1.Auth.CompletePasskeyLoginResponse> getCompletePasskeyLoginMethod() {
    io.grpc.MethodDescriptor<patches.v1.Auth.CompletePasskeyLoginRequest, patches.v1.Auth.CompletePasskeyLoginResponse> getCompletePasskeyLoginMethod;
    if ((getCompletePasskeyLoginMethod = AuthServiceGrpc.getCompletePasskeyLoginMethod) == null) {
      synchronized (AuthServiceGrpc.class) {
        if ((getCompletePasskeyLoginMethod = AuthServiceGrpc.getCompletePasskeyLoginMethod) == null) {
          AuthServiceGrpc.getCompletePasskeyLoginMethod = getCompletePasskeyLoginMethod =
              io.grpc.MethodDescriptor.<patches.v1.Auth.CompletePasskeyLoginRequest, patches.v1.Auth.CompletePasskeyLoginResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "CompletePasskeyLogin"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.CompletePasskeyLoginRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  patches.v1.Auth.CompletePasskeyLoginResponse.getDefaultInstance()))
              .setSchemaDescriptor(new AuthServiceMethodDescriptorSupplier("CompletePasskeyLogin"))
              .build();
        }
      }
    }
    return getCompletePasskeyLoginMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static AuthServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AuthServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AuthServiceStub>() {
        @java.lang.Override
        public AuthServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AuthServiceStub(channel, callOptions);
        }
      };
    return AuthServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static AuthServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AuthServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AuthServiceBlockingV2Stub>() {
        @java.lang.Override
        public AuthServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AuthServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return AuthServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static AuthServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AuthServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AuthServiceBlockingStub>() {
        @java.lang.Override
        public AuthServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AuthServiceBlockingStub(channel, callOptions);
        }
      };
    return AuthServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static AuthServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<AuthServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<AuthServiceFutureStub>() {
        @java.lang.Override
        public AuthServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new AuthServiceFutureStub(channel, callOptions);
        }
      };
    return AuthServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Local account authentication and credential management (spec §33–39, §48, and Amendment A
   * §162, §165–168). Session issuance/rotation only — `ActorService` owns profile data,
   * `SocialGraphService` owns follow/mute/block state.
   * A credential proves you are a user; it is not who you are (§165). One user account may
   * hold several credentials (password, SSH keys, GitHub) side by side, and every login RPC
   * below returns the same `Session` envelope regardless of which credential was used.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Always unauthenticated, always cheap (P15-002): what credential types this node currently
     * accepts. A client MUST call this — or read `password_auth` off a cached recent call —
     * before rendering any password field on a login or register screen, and hide that field
     * entirely (not merely disable it) when the answer is `PASSWORD_AUTH_MODE_OFF`. Kept on
     * `AuthService` rather than `NodeService.GetNodeInfo`/`GetNodePolicy` (§163, §197.6) even
     * though it is conceptually node policy, so this credential-focused capability lives next to
     * the RPCs it actually gates (`Login`, `Register`, `AddCredential`).
     * </pre>
     */
    default void getAuthPolicy(patches.v1.Auth.GetAuthPolicyRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.GetAuthPolicyResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetAuthPolicyMethod(), responseObserver);
    }

    /**
     * <pre>
     * Invite-gated in v0 (spec §33). Accepts an optional initial credential beyond the
     * password (`ssh_public_key`) so SSH-first registration never has to pass through a
     * password. Returns an active session even though the account's recovery email (if any)
     * is not yet verified — see `Session.email_verified`.
     * </pre>
     */
    default void register(patches.v1.Auth.RegisterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RegisterResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRegisterMethod(), responseObserver);
    }

    /**
     * <pre>
     * Consumes a single-use verification code for the account's recovery email (spec §38,
     * §165 — applies only to accounts with a verified/verifiable recovery email).
     * </pre>
     */
    default void verifyEmail(patches.v1.Auth.VerifyEmailRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.VerifyEmailResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getVerifyEmailMethod(), responseObserver);
    }

    /**
     * <pre>
     * Re-issues a verification code for the *authenticated caller's* account (the
     * `authorization` metadata identifies the account — there is no unauthenticated resend so
     * as to avoid leaking whether an email is registered, spec §177).
     * </pre>
     */
    default void resendVerification(patches.v1.Auth.ResendVerificationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ResendVerificationResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getResendVerificationMethod(), responseObserver);
    }

    /**
     * <pre>
     * The **password** login (spec §168). Kept as a dedicated RPC, not a polymorphic
     * grab-bag of credential types — SSH and GitHub each get their own RPC pair below.
     * </pre>
     */
    default void login(patches.v1.Auth.LoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.LoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getLoginMethod(), responseObserver);
    }

    /**
     * <pre>
     * Rotates the refresh token (spec §36). Reuse of an already-rotated token revokes the
     * whole session family.
     * </pre>
     */
    default void refreshSession(patches.v1.Auth.RefreshSessionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RefreshSessionResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRefreshSessionMethod(), responseObserver);
    }

    /**
     * <pre>
     * Revokes the session tied to the given refresh token.
     * </pre>
     */
    default void logout(patches.v1.Auth.LogoutRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.LogoutResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getLogoutMethod(), responseObserver);
    }

    /**
     * <pre>
     * Revokes every session for the authenticated caller's account.
     * </pre>
     */
    default void logoutAllSessions(patches.v1.Auth.LogoutAllSessionsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.LogoutAllSessionsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getLogoutAllSessionsMethod(), responseObserver);
    }

    /**
     * <pre>
     * Applies only to accounts with a verified recovery email (spec §165). Always returns
     * success regardless of whether `email` is registered, to avoid account enumeration.
     * </pre>
     */
    default void requestPasswordReset(patches.v1.Auth.RequestPasswordResetRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RequestPasswordResetResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRequestPasswordResetMethod(), responseObserver);
    }

    /**
     * <pre>
     * Consumes a single-use `password_reset_codes` row.
     * </pre>
     */
    default void resetPassword(patches.v1.Auth.ResetPasswordRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ResetPasswordResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getResetPasswordMethod(), responseObserver);
    }

    /**
     * <pre>
     * Returns session/actor info for the caller's current access token.
     * </pre>
     */
    default void getCurrentSession(patches.v1.Auth.GetCurrentSessionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.GetCurrentSessionResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGetCurrentSessionMethod(), responseObserver);
    }

    /**
     * <pre>
     * SSH public-key login (spec §166). `BeginSshLogin` issues a single-use, short-TTL
     * challenge; the client has its SSH agent sign it; `CompleteSshLogin` verifies the
     * signature over the exact reconstructed blob and returns a session. Never reads,
     * requests, or transmits a private key — signing happens in the agent.
     * </pre>
     */
    default void beginSshLogin(patches.v1.Auth.BeginSshLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginSshLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginSshLoginMethod(), responseObserver);
    }

    /**
     */
    default void completeSshLogin(patches.v1.Auth.CompleteSshLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.CompleteSshLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCompleteSshLoginMethod(), responseObserver);
    }

    /**
     * <pre>
     * GitHub credential via OAuth device flow (spec §167) — GitHub is a credential, never an
     * identity; no profile field is ever populated from it automatically. `BeginGitHubLogin`
     * starts the device flow, `PollGitHubLogin` is polled at the returned `interval` until a
     * terminal status. Schema-only in Phase 1 — the implementation lands in Phase 6 (spec
     * §176), once the URL/timeout/SSRF validation baseline for outbound HTTP calls exists.
     * </pre>
     */
    default void beginGitHubLogin(patches.v1.Auth.BeginGitHubLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginGitHubLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginGitHubLoginMethod(), responseObserver);
    }

    /**
     */
    default void pollGitHubLogin(patches.v1.Auth.PollGitHubLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.PollGitHubLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPollGitHubLoginMethod(), responseObserver);
    }

    /**
     * <pre>
     * Generic OIDC device flow (P15-006, spec §167 extended to "any OIDC-device-flow provider,
     * not just GitHub") — GitLab, Codeberg, or any other node-configured provider. `provider`
     * selects one of `GetAuthPolicyResponse.oidc_providers` by id; an unknown or unconfigured id
     * fails the same way an unconfigured GitHub client id does. Exactly the same credential-not-
     * identity contract as `BeginGitHubLogin`/`PollGitHubLogin`: no profile field is ever
     * populated from it automatically, and `identifier` is namespaced per provider so two
     * providers' subjects can never collide.
     * </pre>
     */
    default void beginOidcLogin(patches.v1.Auth.BeginOidcLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginOidcLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginOidcLoginMethod(), responseObserver);
    }

    /**
     */
    default void pollOidcLogin(patches.v1.Auth.PollOidcLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.PollOidcLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPollOidcLoginMethod(), responseObserver);
    }

    /**
     * <pre>
     * P15-005: a browser cannot prove possession of an SSH key, but the terminal it is already
     * signed in from can. `BeginDeviceLink` is unauthenticated (any browser tab may start one) and
     * returns two codes: `device_code`, a long secret the browser alone holds and polls with, and
     * `user_code`, a short code it displays for a human to read and type. There is no third party
     * and no central SSO anywhere in this flow — it is one node mediating between two of the same
     * user's own devices.
     * The account holder runs `patches approve &lt;user_code&gt;` from a terminal session that is
     * *already signed in* — `ApproveDeviceLink` requires the `authorization` metadata a signed-in
     * CLI already carries, exactly like `AddCredential`'s "linking requires an authenticated
     * session" rule (spec §167). It binds the pending link to that caller's account and nothing
     * else; the browser never learns which account approved it except by receiving that account's
     * own session once it does. A missing, unknown, expired, or already-approved `user_code` is
     * rejected uniformly — the code is single-use.
     * `PollDeviceLink` is the unauthenticated browser-side poll on `device_code`, mirroring
     * `PollGitHubLogin`/`PollOidcLogin`'s shape (`PENDING`/`SLOW_DOWN`/`EXPIRED`/`COMPLETE`).
     * Because `user_code` is short enough for a human to type, it MUST be short-TTL, single-use,
     * and rate-limited on both `BeginDeviceLink` and `ApproveDeviceLink` server-side — the CLI
     * additionally shows the code back to the user and asks them to confirm before calling
     * `ApproveDeviceLink`, since nothing server-side can distinguish an account holder approving
     * their own login from one talked into approving someone else's by social engineering.
     * </pre>
     */
    default void beginDeviceLink(patches.v1.Auth.BeginDeviceLinkRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginDeviceLinkResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginDeviceLinkMethod(), responseObserver);
    }

    /**
     */
    default void pollDeviceLink(patches.v1.Auth.PollDeviceLinkRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.PollDeviceLinkResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getPollDeviceLinkMethod(), responseObserver);
    }

    /**
     */
    default void approveDeviceLink(patches.v1.Auth.ApproveDeviceLinkRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ApproveDeviceLinkResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getApproveDeviceLinkMethod(), responseObserver);
    }

    /**
     * <pre>
     * Credential management (spec §165). `ListCredentials` never returns `secret_hash` or any
     * other secret material — type, label, identifier, timestamps only.
     * </pre>
     */
    default void listCredentials(patches.v1.Auth.ListCredentialsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ListCredentialsResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getListCredentialsMethod(), responseObserver);
    }

    /**
     * <pre>
     * SSH credential enrollment challenge (spec §165-166, B-021). Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account and the fingerprint of
     * `public_key_openssh`, mirroring `BeginSshLogin`/`CompleteSshLogin`'s shape so
     * `AddCredential(SSH_PUBLIC_KEY)` can require a real possession proof (`SshEnrollmentProof`)
     * instead of trusting the client's own local check.
     * </pre>
     */
    default void beginSshEnrollment(patches.v1.Auth.BeginSshEnrollmentRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginSshEnrollmentResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginSshEnrollmentMethod(), responseObserver);
    }

    /**
     * <pre>
     * Adds a PASSWORD or SSH_PUBLIC_KEY credential to the authenticated caller's account.
     * GITHUB credentials are linked via `BeginGitHubLogin`/`PollGitHubLogin` called with an
     * authenticated session instead, not through this RPC (spec §167's "linking ... MUST
     * require an authenticated Patches session"). SSH_PUBLIC_KEY MUST carry `ssh_proof` from a
     * prior `BeginSshEnrollment` call (B-021); a missing, expired, replayed, or key-mismatched
     * proof is rejected.
     * </pre>
     */
    default void addCredential(patches.v1.Auth.AddCredentialRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.AddCredentialResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getAddCredentialMethod(), responseObserver);
    }

    /**
     * <pre>
     * Revoking a user's last active credential MUST fail server-side (spec §165) — an account
     * must always retain a way in.
     * </pre>
     */
    default void revokeCredential(patches.v1.Auth.RevokeCredentialRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RevokeCredentialResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRevokeCredentialMethod(), responseObserver);
    }

    /**
     * <pre>
     * Mints a fresh set of 10 single-use recovery codes for the authenticated caller, replacing
     * (revoking) any codes generated previously (P15-003, spec §165). Codes are returned exactly
     * once, in this response, and only their Argon2id hash is ever stored — there is no
     * `GetRecoveryCodes`. Meant for an SSH/GitHub-only account (no password, no verified
     * recovery email) to still be able to recover access.
     * </pre>
     */
    default void generateRecoveryCodes(patches.v1.Auth.GenerateRecoveryCodesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.GenerateRecoveryCodesResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getGenerateRecoveryCodesMethod(), responseObserver);
    }

    /**
     * <pre>
     * Consumes one single-use recovery code and returns a session, the same way `Login` does for
     * a password (P15-003). The redeemed code is immediately revoked so it cannot be replayed;
     * the account's other unused codes remain valid. Always issues the same generic-failure
     * error as `Login` on a bad handle/code combination, for the same no-enumeration reason.
     * </pre>
     */
    default void recoveryLogin(patches.v1.Auth.RecoveryLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RecoveryLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRecoveryLoginMethod(), responseObserver);
    }

    /**
     * <pre>
     * Passkeys/WebAuthn (P15-004, ADR 0022, `docs/architecture/auth.md`). Web-client-only — the
     * TUI has no browser relying party and none is planned (ADR 0011, ADR 0022). Every payload
     * here is the corresponding `&#64;simplewebauthn/&#42;` JSON type carried verbatim as an opaque
     * `string`, rather than a field-by-field proto mirror of the WebAuthn spec's own options/
     * response objects — see `docs/research/simplewebauthn.md` for why. Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account, mirroring
     * `BeginSshEnrollment`/`AddCredential(SSH_PUBLIC_KEY)`'s possession-proof shape.
     * </pre>
     */
    default void beginPasskeyRegistration(patches.v1.Auth.BeginPasskeyRegistrationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginPasskeyRegistrationResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginPasskeyRegistrationMethod(), responseObserver);
    }

    /**
     */
    default void completePasskeyRegistration(patches.v1.Auth.CompletePasskeyRegistrationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.CompletePasskeyRegistrationResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCompletePasskeyRegistrationMethod(), responseObserver);
    }

    /**
     * <pre>
     * Unauthenticated, discoverable-credential login (no username/handle is ever supplied or
     * required) — the credential response itself identifies the account via its WebAuthn
     * credential id. `BeginPasskeyLogin` always issues a challenge (mirrors `BeginSshLogin`'s
     * no-enumeration rule, though there is nothing to enumerate here since no identifier is ever
     * supplied); `CompletePasskeyLogin` verifies the assertion and returns a session. A sign-count
     * regression is treated as a possible credential clone: rejected with the same uniform
     * `AUTH_INVALID_CREDENTIALS` every other auth failure here uses, and a `SECURITY`
     * notification is written (mirrors `RecoveryLogin`'s convention).
     * </pre>
     */
    default void beginPasskeyLogin(patches.v1.Auth.BeginPasskeyLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginPasskeyLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getBeginPasskeyLoginMethod(), responseObserver);
    }

    /**
     */
    default void completePasskeyLogin(patches.v1.Auth.CompletePasskeyLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.CompletePasskeyLoginResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getCompletePasskeyLoginMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service AuthService.
   * <pre>
   * Local account authentication and credential management (spec §33–39, §48, and Amendment A
   * §162, §165–168). Session issuance/rotation only — `ActorService` owns profile data,
   * `SocialGraphService` owns follow/mute/block state.
   * A credential proves you are a user; it is not who you are (§165). One user account may
   * hold several credentials (password, SSH keys, GitHub) side by side, and every login RPC
   * below returns the same `Session` envelope regardless of which credential was used.
   * </pre>
   */
  public static abstract class AuthServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return AuthServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service AuthService.
   * <pre>
   * Local account authentication and credential management (spec §33–39, §48, and Amendment A
   * §162, §165–168). Session issuance/rotation only — `ActorService` owns profile data,
   * `SocialGraphService` owns follow/mute/block state.
   * A credential proves you are a user; it is not who you are (§165). One user account may
   * hold several credentials (password, SSH keys, GitHub) side by side, and every login RPC
   * below returns the same `Session` envelope regardless of which credential was used.
   * </pre>
   */
  public static final class AuthServiceStub
      extends io.grpc.stub.AbstractAsyncStub<AuthServiceStub> {
    private AuthServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AuthServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AuthServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Always unauthenticated, always cheap (P15-002): what credential types this node currently
     * accepts. A client MUST call this — or read `password_auth` off a cached recent call —
     * before rendering any password field on a login or register screen, and hide that field
     * entirely (not merely disable it) when the answer is `PASSWORD_AUTH_MODE_OFF`. Kept on
     * `AuthService` rather than `NodeService.GetNodeInfo`/`GetNodePolicy` (§163, §197.6) even
     * though it is conceptually node policy, so this credential-focused capability lives next to
     * the RPCs it actually gates (`Login`, `Register`, `AddCredential`).
     * </pre>
     */
    public void getAuthPolicy(patches.v1.Auth.GetAuthPolicyRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.GetAuthPolicyResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetAuthPolicyMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Invite-gated in v0 (spec §33). Accepts an optional initial credential beyond the
     * password (`ssh_public_key`) so SSH-first registration never has to pass through a
     * password. Returns an active session even though the account's recovery email (if any)
     * is not yet verified — see `Session.email_verified`.
     * </pre>
     */
    public void register(patches.v1.Auth.RegisterRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RegisterResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRegisterMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Consumes a single-use verification code for the account's recovery email (spec §38,
     * §165 — applies only to accounts with a verified/verifiable recovery email).
     * </pre>
     */
    public void verifyEmail(patches.v1.Auth.VerifyEmailRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.VerifyEmailResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getVerifyEmailMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Re-issues a verification code for the *authenticated caller's* account (the
     * `authorization` metadata identifies the account — there is no unauthenticated resend so
     * as to avoid leaking whether an email is registered, spec §177).
     * </pre>
     */
    public void resendVerification(patches.v1.Auth.ResendVerificationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ResendVerificationResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getResendVerificationMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * The **password** login (spec §168). Kept as a dedicated RPC, not a polymorphic
     * grab-bag of credential types — SSH and GitHub each get their own RPC pair below.
     * </pre>
     */
    public void login(patches.v1.Auth.LoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.LoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Rotates the refresh token (spec §36). Reuse of an already-rotated token revokes the
     * whole session family.
     * </pre>
     */
    public void refreshSession(patches.v1.Auth.RefreshSessionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RefreshSessionResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRefreshSessionMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Revokes the session tied to the given refresh token.
     * </pre>
     */
    public void logout(patches.v1.Auth.LogoutRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.LogoutResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getLogoutMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Revokes every session for the authenticated caller's account.
     * </pre>
     */
    public void logoutAllSessions(patches.v1.Auth.LogoutAllSessionsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.LogoutAllSessionsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getLogoutAllSessionsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Applies only to accounts with a verified recovery email (spec §165). Always returns
     * success regardless of whether `email` is registered, to avoid account enumeration.
     * </pre>
     */
    public void requestPasswordReset(patches.v1.Auth.RequestPasswordResetRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RequestPasswordResetResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRequestPasswordResetMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Consumes a single-use `password_reset_codes` row.
     * </pre>
     */
    public void resetPassword(patches.v1.Auth.ResetPasswordRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ResetPasswordResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getResetPasswordMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Returns session/actor info for the caller's current access token.
     * </pre>
     */
    public void getCurrentSession(patches.v1.Auth.GetCurrentSessionRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.GetCurrentSessionResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGetCurrentSessionMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * SSH public-key login (spec §166). `BeginSshLogin` issues a single-use, short-TTL
     * challenge; the client has its SSH agent sign it; `CompleteSshLogin` verifies the
     * signature over the exact reconstructed blob and returns a session. Never reads,
     * requests, or transmits a private key — signing happens in the agent.
     * </pre>
     */
    public void beginSshLogin(patches.v1.Auth.BeginSshLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginSshLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginSshLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void completeSshLogin(patches.v1.Auth.CompleteSshLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.CompleteSshLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCompleteSshLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * GitHub credential via OAuth device flow (spec §167) — GitHub is a credential, never an
     * identity; no profile field is ever populated from it automatically. `BeginGitHubLogin`
     * starts the device flow, `PollGitHubLogin` is polled at the returned `interval` until a
     * terminal status. Schema-only in Phase 1 — the implementation lands in Phase 6 (spec
     * §176), once the URL/timeout/SSRF validation baseline for outbound HTTP calls exists.
     * </pre>
     */
    public void beginGitHubLogin(patches.v1.Auth.BeginGitHubLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginGitHubLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginGitHubLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void pollGitHubLogin(patches.v1.Auth.PollGitHubLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.PollGitHubLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPollGitHubLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Generic OIDC device flow (P15-006, spec §167 extended to "any OIDC-device-flow provider,
     * not just GitHub") — GitLab, Codeberg, or any other node-configured provider. `provider`
     * selects one of `GetAuthPolicyResponse.oidc_providers` by id; an unknown or unconfigured id
     * fails the same way an unconfigured GitHub client id does. Exactly the same credential-not-
     * identity contract as `BeginGitHubLogin`/`PollGitHubLogin`: no profile field is ever
     * populated from it automatically, and `identifier` is namespaced per provider so two
     * providers' subjects can never collide.
     * </pre>
     */
    public void beginOidcLogin(patches.v1.Auth.BeginOidcLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginOidcLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginOidcLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void pollOidcLogin(patches.v1.Auth.PollOidcLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.PollOidcLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPollOidcLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * P15-005: a browser cannot prove possession of an SSH key, but the terminal it is already
     * signed in from can. `BeginDeviceLink` is unauthenticated (any browser tab may start one) and
     * returns two codes: `device_code`, a long secret the browser alone holds and polls with, and
     * `user_code`, a short code it displays for a human to read and type. There is no third party
     * and no central SSO anywhere in this flow — it is one node mediating between two of the same
     * user's own devices.
     * The account holder runs `patches approve &lt;user_code&gt;` from a terminal session that is
     * *already signed in* — `ApproveDeviceLink` requires the `authorization` metadata a signed-in
     * CLI already carries, exactly like `AddCredential`'s "linking requires an authenticated
     * session" rule (spec §167). It binds the pending link to that caller's account and nothing
     * else; the browser never learns which account approved it except by receiving that account's
     * own session once it does. A missing, unknown, expired, or already-approved `user_code` is
     * rejected uniformly — the code is single-use.
     * `PollDeviceLink` is the unauthenticated browser-side poll on `device_code`, mirroring
     * `PollGitHubLogin`/`PollOidcLogin`'s shape (`PENDING`/`SLOW_DOWN`/`EXPIRED`/`COMPLETE`).
     * Because `user_code` is short enough for a human to type, it MUST be short-TTL, single-use,
     * and rate-limited on both `BeginDeviceLink` and `ApproveDeviceLink` server-side — the CLI
     * additionally shows the code back to the user and asks them to confirm before calling
     * `ApproveDeviceLink`, since nothing server-side can distinguish an account holder approving
     * their own login from one talked into approving someone else's by social engineering.
     * </pre>
     */
    public void beginDeviceLink(patches.v1.Auth.BeginDeviceLinkRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginDeviceLinkResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginDeviceLinkMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void pollDeviceLink(patches.v1.Auth.PollDeviceLinkRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.PollDeviceLinkResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getPollDeviceLinkMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void approveDeviceLink(patches.v1.Auth.ApproveDeviceLinkRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ApproveDeviceLinkResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getApproveDeviceLinkMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Credential management (spec §165). `ListCredentials` never returns `secret_hash` or any
     * other secret material — type, label, identifier, timestamps only.
     * </pre>
     */
    public void listCredentials(patches.v1.Auth.ListCredentialsRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.ListCredentialsResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getListCredentialsMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * SSH credential enrollment challenge (spec §165-166, B-021). Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account and the fingerprint of
     * `public_key_openssh`, mirroring `BeginSshLogin`/`CompleteSshLogin`'s shape so
     * `AddCredential(SSH_PUBLIC_KEY)` can require a real possession proof (`SshEnrollmentProof`)
     * instead of trusting the client's own local check.
     * </pre>
     */
    public void beginSshEnrollment(patches.v1.Auth.BeginSshEnrollmentRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginSshEnrollmentResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginSshEnrollmentMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Adds a PASSWORD or SSH_PUBLIC_KEY credential to the authenticated caller's account.
     * GITHUB credentials are linked via `BeginGitHubLogin`/`PollGitHubLogin` called with an
     * authenticated session instead, not through this RPC (spec §167's "linking ... MUST
     * require an authenticated Patches session"). SSH_PUBLIC_KEY MUST carry `ssh_proof` from a
     * prior `BeginSshEnrollment` call (B-021); a missing, expired, replayed, or key-mismatched
     * proof is rejected.
     * </pre>
     */
    public void addCredential(patches.v1.Auth.AddCredentialRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.AddCredentialResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getAddCredentialMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Revoking a user's last active credential MUST fail server-side (spec §165) — an account
     * must always retain a way in.
     * </pre>
     */
    public void revokeCredential(patches.v1.Auth.RevokeCredentialRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RevokeCredentialResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRevokeCredentialMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Mints a fresh set of 10 single-use recovery codes for the authenticated caller, replacing
     * (revoking) any codes generated previously (P15-003, spec §165). Codes are returned exactly
     * once, in this response, and only their Argon2id hash is ever stored — there is no
     * `GetRecoveryCodes`. Meant for an SSH/GitHub-only account (no password, no verified
     * recovery email) to still be able to recover access.
     * </pre>
     */
    public void generateRecoveryCodes(patches.v1.Auth.GenerateRecoveryCodesRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.GenerateRecoveryCodesResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getGenerateRecoveryCodesMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Consumes one single-use recovery code and returns a session, the same way `Login` does for
     * a password (P15-003). The redeemed code is immediately revoked so it cannot be replayed;
     * the account's other unused codes remain valid. Always issues the same generic-failure
     * error as `Login` on a bad handle/code combination, for the same no-enumeration reason.
     * </pre>
     */
    public void recoveryLogin(patches.v1.Auth.RecoveryLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.RecoveryLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRecoveryLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Passkeys/WebAuthn (P15-004, ADR 0022, `docs/architecture/auth.md`). Web-client-only — the
     * TUI has no browser relying party and none is planned (ADR 0011, ADR 0022). Every payload
     * here is the corresponding `&#64;simplewebauthn/&#42;` JSON type carried verbatim as an opaque
     * `string`, rather than a field-by-field proto mirror of the WebAuthn spec's own options/
     * response objects — see `docs/research/simplewebauthn.md` for why. Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account, mirroring
     * `BeginSshEnrollment`/`AddCredential(SSH_PUBLIC_KEY)`'s possession-proof shape.
     * </pre>
     */
    public void beginPasskeyRegistration(patches.v1.Auth.BeginPasskeyRegistrationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginPasskeyRegistrationResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginPasskeyRegistrationMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void completePasskeyRegistration(patches.v1.Auth.CompletePasskeyRegistrationRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.CompletePasskeyRegistrationResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCompletePasskeyRegistrationMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Unauthenticated, discoverable-credential login (no username/handle is ever supplied or
     * required) — the credential response itself identifies the account via its WebAuthn
     * credential id. `BeginPasskeyLogin` always issues a challenge (mirrors `BeginSshLogin`'s
     * no-enumeration rule, though there is nothing to enumerate here since no identifier is ever
     * supplied); `CompletePasskeyLogin` verifies the assertion and returns a session. A sign-count
     * regression is treated as a possible credential clone: rejected with the same uniform
     * `AUTH_INVALID_CREDENTIALS` every other auth failure here uses, and a `SECURITY`
     * notification is written (mirrors `RecoveryLogin`'s convention).
     * </pre>
     */
    public void beginPasskeyLogin(patches.v1.Auth.BeginPasskeyLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.BeginPasskeyLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getBeginPasskeyLoginMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     */
    public void completePasskeyLogin(patches.v1.Auth.CompletePasskeyLoginRequest request,
        io.grpc.stub.StreamObserver<patches.v1.Auth.CompletePasskeyLoginResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getCompletePasskeyLoginMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service AuthService.
   * <pre>
   * Local account authentication and credential management (spec §33–39, §48, and Amendment A
   * §162, §165–168). Session issuance/rotation only — `ActorService` owns profile data,
   * `SocialGraphService` owns follow/mute/block state.
   * A credential proves you are a user; it is not who you are (§165). One user account may
   * hold several credentials (password, SSH keys, GitHub) side by side, and every login RPC
   * below returns the same `Session` envelope regardless of which credential was used.
   * </pre>
   */
  public static final class AuthServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<AuthServiceBlockingV2Stub> {
    private AuthServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AuthServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AuthServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Always unauthenticated, always cheap (P15-002): what credential types this node currently
     * accepts. A client MUST call this — or read `password_auth` off a cached recent call —
     * before rendering any password field on a login or register screen, and hide that field
     * entirely (not merely disable it) when the answer is `PASSWORD_AUTH_MODE_OFF`. Kept on
     * `AuthService` rather than `NodeService.GetNodeInfo`/`GetNodePolicy` (§163, §197.6) even
     * though it is conceptually node policy, so this credential-focused capability lives next to
     * the RPCs it actually gates (`Login`, `Register`, `AddCredential`).
     * </pre>
     */
    public patches.v1.Auth.GetAuthPolicyResponse getAuthPolicy(patches.v1.Auth.GetAuthPolicyRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetAuthPolicyMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Invite-gated in v0 (spec §33). Accepts an optional initial credential beyond the
     * password (`ssh_public_key`) so SSH-first registration never has to pass through a
     * password. Returns an active session even though the account's recovery email (if any)
     * is not yet verified — see `Session.email_verified`.
     * </pre>
     */
    public patches.v1.Auth.RegisterResponse register(patches.v1.Auth.RegisterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRegisterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Consumes a single-use verification code for the account's recovery email (spec §38,
     * §165 — applies only to accounts with a verified/verifiable recovery email).
     * </pre>
     */
    public patches.v1.Auth.VerifyEmailResponse verifyEmail(patches.v1.Auth.VerifyEmailRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getVerifyEmailMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Re-issues a verification code for the *authenticated caller's* account (the
     * `authorization` metadata identifies the account — there is no unauthenticated resend so
     * as to avoid leaking whether an email is registered, spec §177).
     * </pre>
     */
    public patches.v1.Auth.ResendVerificationResponse resendVerification(patches.v1.Auth.ResendVerificationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getResendVerificationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The **password** login (spec §168). Kept as a dedicated RPC, not a polymorphic
     * grab-bag of credential types — SSH and GitHub each get their own RPC pair below.
     * </pre>
     */
    public patches.v1.Auth.LoginResponse login(patches.v1.Auth.LoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rotates the refresh token (spec §36). Reuse of an already-rotated token revokes the
     * whole session family.
     * </pre>
     */
    public patches.v1.Auth.RefreshSessionResponse refreshSession(patches.v1.Auth.RefreshSessionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRefreshSessionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revokes the session tied to the given refresh token.
     * </pre>
     */
    public patches.v1.Auth.LogoutResponse logout(patches.v1.Auth.LogoutRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLogoutMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revokes every session for the authenticated caller's account.
     * </pre>
     */
    public patches.v1.Auth.LogoutAllSessionsResponse logoutAllSessions(patches.v1.Auth.LogoutAllSessionsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLogoutAllSessionsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Applies only to accounts with a verified recovery email (spec §165). Always returns
     * success regardless of whether `email` is registered, to avoid account enumeration.
     * </pre>
     */
    public patches.v1.Auth.RequestPasswordResetResponse requestPasswordReset(patches.v1.Auth.RequestPasswordResetRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRequestPasswordResetMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Consumes a single-use `password_reset_codes` row.
     * </pre>
     */
    public patches.v1.Auth.ResetPasswordResponse resetPassword(patches.v1.Auth.ResetPasswordRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getResetPasswordMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Returns session/actor info for the caller's current access token.
     * </pre>
     */
    public patches.v1.Auth.GetCurrentSessionResponse getCurrentSession(patches.v1.Auth.GetCurrentSessionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetCurrentSessionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SSH public-key login (spec §166). `BeginSshLogin` issues a single-use, short-TTL
     * challenge; the client has its SSH agent sign it; `CompleteSshLogin` verifies the
     * signature over the exact reconstructed blob and returns a session. Never reads,
     * requests, or transmits a private key — signing happens in the agent.
     * </pre>
     */
    public patches.v1.Auth.BeginSshLoginResponse beginSshLogin(patches.v1.Auth.BeginSshLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginSshLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.CompleteSshLoginResponse completeSshLogin(patches.v1.Auth.CompleteSshLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompleteSshLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GitHub credential via OAuth device flow (spec §167) — GitHub is a credential, never an
     * identity; no profile field is ever populated from it automatically. `BeginGitHubLogin`
     * starts the device flow, `PollGitHubLogin` is polled at the returned `interval` until a
     * terminal status. Schema-only in Phase 1 — the implementation lands in Phase 6 (spec
     * §176), once the URL/timeout/SSRF validation baseline for outbound HTTP calls exists.
     * </pre>
     */
    public patches.v1.Auth.BeginGitHubLoginResponse beginGitHubLogin(patches.v1.Auth.BeginGitHubLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginGitHubLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.PollGitHubLoginResponse pollGitHubLogin(patches.v1.Auth.PollGitHubLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPollGitHubLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Generic OIDC device flow (P15-006, spec §167 extended to "any OIDC-device-flow provider,
     * not just GitHub") — GitLab, Codeberg, or any other node-configured provider. `provider`
     * selects one of `GetAuthPolicyResponse.oidc_providers` by id; an unknown or unconfigured id
     * fails the same way an unconfigured GitHub client id does. Exactly the same credential-not-
     * identity contract as `BeginGitHubLogin`/`PollGitHubLogin`: no profile field is ever
     * populated from it automatically, and `identifier` is namespaced per provider so two
     * providers' subjects can never collide.
     * </pre>
     */
    public patches.v1.Auth.BeginOidcLoginResponse beginOidcLogin(patches.v1.Auth.BeginOidcLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginOidcLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.PollOidcLoginResponse pollOidcLogin(patches.v1.Auth.PollOidcLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPollOidcLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * P15-005: a browser cannot prove possession of an SSH key, but the terminal it is already
     * signed in from can. `BeginDeviceLink` is unauthenticated (any browser tab may start one) and
     * returns two codes: `device_code`, a long secret the browser alone holds and polls with, and
     * `user_code`, a short code it displays for a human to read and type. There is no third party
     * and no central SSO anywhere in this flow — it is one node mediating between two of the same
     * user's own devices.
     * The account holder runs `patches approve &lt;user_code&gt;` from a terminal session that is
     * *already signed in* — `ApproveDeviceLink` requires the `authorization` metadata a signed-in
     * CLI already carries, exactly like `AddCredential`'s "linking requires an authenticated
     * session" rule (spec §167). It binds the pending link to that caller's account and nothing
     * else; the browser never learns which account approved it except by receiving that account's
     * own session once it does. A missing, unknown, expired, or already-approved `user_code` is
     * rejected uniformly — the code is single-use.
     * `PollDeviceLink` is the unauthenticated browser-side poll on `device_code`, mirroring
     * `PollGitHubLogin`/`PollOidcLogin`'s shape (`PENDING`/`SLOW_DOWN`/`EXPIRED`/`COMPLETE`).
     * Because `user_code` is short enough for a human to type, it MUST be short-TTL, single-use,
     * and rate-limited on both `BeginDeviceLink` and `ApproveDeviceLink` server-side — the CLI
     * additionally shows the code back to the user and asks them to confirm before calling
     * `ApproveDeviceLink`, since nothing server-side can distinguish an account holder approving
     * their own login from one talked into approving someone else's by social engineering.
     * </pre>
     */
    public patches.v1.Auth.BeginDeviceLinkResponse beginDeviceLink(patches.v1.Auth.BeginDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginDeviceLinkMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.PollDeviceLinkResponse pollDeviceLink(patches.v1.Auth.PollDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPollDeviceLinkMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.ApproveDeviceLinkResponse approveDeviceLink(patches.v1.Auth.ApproveDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getApproveDeviceLinkMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Credential management (spec §165). `ListCredentials` never returns `secret_hash` or any
     * other secret material — type, label, identifier, timestamps only.
     * </pre>
     */
    public patches.v1.Auth.ListCredentialsResponse listCredentials(patches.v1.Auth.ListCredentialsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCredentialsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SSH credential enrollment challenge (spec §165-166, B-021). Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account and the fingerprint of
     * `public_key_openssh`, mirroring `BeginSshLogin`/`CompleteSshLogin`'s shape so
     * `AddCredential(SSH_PUBLIC_KEY)` can require a real possession proof (`SshEnrollmentProof`)
     * instead of trusting the client's own local check.
     * </pre>
     */
    public patches.v1.Auth.BeginSshEnrollmentResponse beginSshEnrollment(patches.v1.Auth.BeginSshEnrollmentRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginSshEnrollmentMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Adds a PASSWORD or SSH_PUBLIC_KEY credential to the authenticated caller's account.
     * GITHUB credentials are linked via `BeginGitHubLogin`/`PollGitHubLogin` called with an
     * authenticated session instead, not through this RPC (spec §167's "linking ... MUST
     * require an authenticated Patches session"). SSH_PUBLIC_KEY MUST carry `ssh_proof` from a
     * prior `BeginSshEnrollment` call (B-021); a missing, expired, replayed, or key-mismatched
     * proof is rejected.
     * </pre>
     */
    public patches.v1.Auth.AddCredentialResponse addCredential(patches.v1.Auth.AddCredentialRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAddCredentialMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revoking a user's last active credential MUST fail server-side (spec §165) — an account
     * must always retain a way in.
     * </pre>
     */
    public patches.v1.Auth.RevokeCredentialResponse revokeCredential(patches.v1.Auth.RevokeCredentialRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRevokeCredentialMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Mints a fresh set of 10 single-use recovery codes for the authenticated caller, replacing
     * (revoking) any codes generated previously (P15-003, spec §165). Codes are returned exactly
     * once, in this response, and only their Argon2id hash is ever stored — there is no
     * `GetRecoveryCodes`. Meant for an SSH/GitHub-only account (no password, no verified
     * recovery email) to still be able to recover access.
     * </pre>
     */
    public patches.v1.Auth.GenerateRecoveryCodesResponse generateRecoveryCodes(patches.v1.Auth.GenerateRecoveryCodesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGenerateRecoveryCodesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Consumes one single-use recovery code and returns a session, the same way `Login` does for
     * a password (P15-003). The redeemed code is immediately revoked so it cannot be replayed;
     * the account's other unused codes remain valid. Always issues the same generic-failure
     * error as `Login` on a bad handle/code combination, for the same no-enumeration reason.
     * </pre>
     */
    public patches.v1.Auth.RecoveryLoginResponse recoveryLogin(patches.v1.Auth.RecoveryLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRecoveryLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Passkeys/WebAuthn (P15-004, ADR 0022, `docs/architecture/auth.md`). Web-client-only — the
     * TUI has no browser relying party and none is planned (ADR 0011, ADR 0022). Every payload
     * here is the corresponding `&#64;simplewebauthn/&#42;` JSON type carried verbatim as an opaque
     * `string`, rather than a field-by-field proto mirror of the WebAuthn spec's own options/
     * response objects — see `docs/research/simplewebauthn.md` for why. Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account, mirroring
     * `BeginSshEnrollment`/`AddCredential(SSH_PUBLIC_KEY)`'s possession-proof shape.
     * </pre>
     */
    public patches.v1.Auth.BeginPasskeyRegistrationResponse beginPasskeyRegistration(patches.v1.Auth.BeginPasskeyRegistrationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginPasskeyRegistrationMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.CompletePasskeyRegistrationResponse completePasskeyRegistration(patches.v1.Auth.CompletePasskeyRegistrationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompletePasskeyRegistrationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Unauthenticated, discoverable-credential login (no username/handle is ever supplied or
     * required) — the credential response itself identifies the account via its WebAuthn
     * credential id. `BeginPasskeyLogin` always issues a challenge (mirrors `BeginSshLogin`'s
     * no-enumeration rule, though there is nothing to enumerate here since no identifier is ever
     * supplied); `CompletePasskeyLogin` verifies the assertion and returns a session. A sign-count
     * regression is treated as a possible credential clone: rejected with the same uniform
     * `AUTH_INVALID_CREDENTIALS` every other auth failure here uses, and a `SECURITY`
     * notification is written (mirrors `RecoveryLogin`'s convention).
     * </pre>
     */
    public patches.v1.Auth.BeginPasskeyLoginResponse beginPasskeyLogin(patches.v1.Auth.BeginPasskeyLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginPasskeyLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.CompletePasskeyLoginResponse completePasskeyLogin(patches.v1.Auth.CompletePasskeyLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompletePasskeyLoginMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service AuthService.
   * <pre>
   * Local account authentication and credential management (spec §33–39, §48, and Amendment A
   * §162, §165–168). Session issuance/rotation only — `ActorService` owns profile data,
   * `SocialGraphService` owns follow/mute/block state.
   * A credential proves you are a user; it is not who you are (§165). One user account may
   * hold several credentials (password, SSH keys, GitHub) side by side, and every login RPC
   * below returns the same `Session` envelope regardless of which credential was used.
   * </pre>
   */
  public static final class AuthServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<AuthServiceBlockingStub> {
    private AuthServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AuthServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AuthServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Always unauthenticated, always cheap (P15-002): what credential types this node currently
     * accepts. A client MUST call this — or read `password_auth` off a cached recent call —
     * before rendering any password field on a login or register screen, and hide that field
     * entirely (not merely disable it) when the answer is `PASSWORD_AUTH_MODE_OFF`. Kept on
     * `AuthService` rather than `NodeService.GetNodeInfo`/`GetNodePolicy` (§163, §197.6) even
     * though it is conceptually node policy, so this credential-focused capability lives next to
     * the RPCs it actually gates (`Login`, `Register`, `AddCredential`).
     * </pre>
     */
    public patches.v1.Auth.GetAuthPolicyResponse getAuthPolicy(patches.v1.Auth.GetAuthPolicyRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetAuthPolicyMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Invite-gated in v0 (spec §33). Accepts an optional initial credential beyond the
     * password (`ssh_public_key`) so SSH-first registration never has to pass through a
     * password. Returns an active session even though the account's recovery email (if any)
     * is not yet verified — see `Session.email_verified`.
     * </pre>
     */
    public patches.v1.Auth.RegisterResponse register(patches.v1.Auth.RegisterRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRegisterMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Consumes a single-use verification code for the account's recovery email (spec §38,
     * §165 — applies only to accounts with a verified/verifiable recovery email).
     * </pre>
     */
    public patches.v1.Auth.VerifyEmailResponse verifyEmail(patches.v1.Auth.VerifyEmailRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getVerifyEmailMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Re-issues a verification code for the *authenticated caller's* account (the
     * `authorization` metadata identifies the account — there is no unauthenticated resend so
     * as to avoid leaking whether an email is registered, spec §177).
     * </pre>
     */
    public patches.v1.Auth.ResendVerificationResponse resendVerification(patches.v1.Auth.ResendVerificationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getResendVerificationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * The **password** login (spec §168). Kept as a dedicated RPC, not a polymorphic
     * grab-bag of credential types — SSH and GitHub each get their own RPC pair below.
     * </pre>
     */
    public patches.v1.Auth.LoginResponse login(patches.v1.Auth.LoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Rotates the refresh token (spec §36). Reuse of an already-rotated token revokes the
     * whole session family.
     * </pre>
     */
    public patches.v1.Auth.RefreshSessionResponse refreshSession(patches.v1.Auth.RefreshSessionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRefreshSessionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revokes the session tied to the given refresh token.
     * </pre>
     */
    public patches.v1.Auth.LogoutResponse logout(patches.v1.Auth.LogoutRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLogoutMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revokes every session for the authenticated caller's account.
     * </pre>
     */
    public patches.v1.Auth.LogoutAllSessionsResponse logoutAllSessions(patches.v1.Auth.LogoutAllSessionsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getLogoutAllSessionsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Applies only to accounts with a verified recovery email (spec §165). Always returns
     * success regardless of whether `email` is registered, to avoid account enumeration.
     * </pre>
     */
    public patches.v1.Auth.RequestPasswordResetResponse requestPasswordReset(patches.v1.Auth.RequestPasswordResetRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRequestPasswordResetMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Consumes a single-use `password_reset_codes` row.
     * </pre>
     */
    public patches.v1.Auth.ResetPasswordResponse resetPassword(patches.v1.Auth.ResetPasswordRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getResetPasswordMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Returns session/actor info for the caller's current access token.
     * </pre>
     */
    public patches.v1.Auth.GetCurrentSessionResponse getCurrentSession(patches.v1.Auth.GetCurrentSessionRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGetCurrentSessionMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SSH public-key login (spec §166). `BeginSshLogin` issues a single-use, short-TTL
     * challenge; the client has its SSH agent sign it; `CompleteSshLogin` verifies the
     * signature over the exact reconstructed blob and returns a session. Never reads,
     * requests, or transmits a private key — signing happens in the agent.
     * </pre>
     */
    public patches.v1.Auth.BeginSshLoginResponse beginSshLogin(patches.v1.Auth.BeginSshLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginSshLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.CompleteSshLoginResponse completeSshLogin(patches.v1.Auth.CompleteSshLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompleteSshLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * GitHub credential via OAuth device flow (spec §167) — GitHub is a credential, never an
     * identity; no profile field is ever populated from it automatically. `BeginGitHubLogin`
     * starts the device flow, `PollGitHubLogin` is polled at the returned `interval` until a
     * terminal status. Schema-only in Phase 1 — the implementation lands in Phase 6 (spec
     * §176), once the URL/timeout/SSRF validation baseline for outbound HTTP calls exists.
     * </pre>
     */
    public patches.v1.Auth.BeginGitHubLoginResponse beginGitHubLogin(patches.v1.Auth.BeginGitHubLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginGitHubLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.PollGitHubLoginResponse pollGitHubLogin(patches.v1.Auth.PollGitHubLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPollGitHubLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Generic OIDC device flow (P15-006, spec §167 extended to "any OIDC-device-flow provider,
     * not just GitHub") — GitLab, Codeberg, or any other node-configured provider. `provider`
     * selects one of `GetAuthPolicyResponse.oidc_providers` by id; an unknown or unconfigured id
     * fails the same way an unconfigured GitHub client id does. Exactly the same credential-not-
     * identity contract as `BeginGitHubLogin`/`PollGitHubLogin`: no profile field is ever
     * populated from it automatically, and `identifier` is namespaced per provider so two
     * providers' subjects can never collide.
     * </pre>
     */
    public patches.v1.Auth.BeginOidcLoginResponse beginOidcLogin(patches.v1.Auth.BeginOidcLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginOidcLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.PollOidcLoginResponse pollOidcLogin(patches.v1.Auth.PollOidcLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPollOidcLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * P15-005: a browser cannot prove possession of an SSH key, but the terminal it is already
     * signed in from can. `BeginDeviceLink` is unauthenticated (any browser tab may start one) and
     * returns two codes: `device_code`, a long secret the browser alone holds and polls with, and
     * `user_code`, a short code it displays for a human to read and type. There is no third party
     * and no central SSO anywhere in this flow — it is one node mediating between two of the same
     * user's own devices.
     * The account holder runs `patches approve &lt;user_code&gt;` from a terminal session that is
     * *already signed in* — `ApproveDeviceLink` requires the `authorization` metadata a signed-in
     * CLI already carries, exactly like `AddCredential`'s "linking requires an authenticated
     * session" rule (spec §167). It binds the pending link to that caller's account and nothing
     * else; the browser never learns which account approved it except by receiving that account's
     * own session once it does. A missing, unknown, expired, or already-approved `user_code` is
     * rejected uniformly — the code is single-use.
     * `PollDeviceLink` is the unauthenticated browser-side poll on `device_code`, mirroring
     * `PollGitHubLogin`/`PollOidcLogin`'s shape (`PENDING`/`SLOW_DOWN`/`EXPIRED`/`COMPLETE`).
     * Because `user_code` is short enough for a human to type, it MUST be short-TTL, single-use,
     * and rate-limited on both `BeginDeviceLink` and `ApproveDeviceLink` server-side — the CLI
     * additionally shows the code back to the user and asks them to confirm before calling
     * `ApproveDeviceLink`, since nothing server-side can distinguish an account holder approving
     * their own login from one talked into approving someone else's by social engineering.
     * </pre>
     */
    public patches.v1.Auth.BeginDeviceLinkResponse beginDeviceLink(patches.v1.Auth.BeginDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginDeviceLinkMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.PollDeviceLinkResponse pollDeviceLink(patches.v1.Auth.PollDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getPollDeviceLinkMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.ApproveDeviceLinkResponse approveDeviceLink(patches.v1.Auth.ApproveDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getApproveDeviceLinkMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Credential management (spec §165). `ListCredentials` never returns `secret_hash` or any
     * other secret material — type, label, identifier, timestamps only.
     * </pre>
     */
    public patches.v1.Auth.ListCredentialsResponse listCredentials(patches.v1.Auth.ListCredentialsRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getListCredentialsMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * SSH credential enrollment challenge (spec §165-166, B-021). Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account and the fingerprint of
     * `public_key_openssh`, mirroring `BeginSshLogin`/`CompleteSshLogin`'s shape so
     * `AddCredential(SSH_PUBLIC_KEY)` can require a real possession proof (`SshEnrollmentProof`)
     * instead of trusting the client's own local check.
     * </pre>
     */
    public patches.v1.Auth.BeginSshEnrollmentResponse beginSshEnrollment(patches.v1.Auth.BeginSshEnrollmentRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginSshEnrollmentMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Adds a PASSWORD or SSH_PUBLIC_KEY credential to the authenticated caller's account.
     * GITHUB credentials are linked via `BeginGitHubLogin`/`PollGitHubLogin` called with an
     * authenticated session instead, not through this RPC (spec §167's "linking ... MUST
     * require an authenticated Patches session"). SSH_PUBLIC_KEY MUST carry `ssh_proof` from a
     * prior `BeginSshEnrollment` call (B-021); a missing, expired, replayed, or key-mismatched
     * proof is rejected.
     * </pre>
     */
    public patches.v1.Auth.AddCredentialResponse addCredential(patches.v1.Auth.AddCredentialRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getAddCredentialMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Revoking a user's last active credential MUST fail server-side (spec §165) — an account
     * must always retain a way in.
     * </pre>
     */
    public patches.v1.Auth.RevokeCredentialResponse revokeCredential(patches.v1.Auth.RevokeCredentialRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRevokeCredentialMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Mints a fresh set of 10 single-use recovery codes for the authenticated caller, replacing
     * (revoking) any codes generated previously (P15-003, spec §165). Codes are returned exactly
     * once, in this response, and only their Argon2id hash is ever stored — there is no
     * `GetRecoveryCodes`. Meant for an SSH/GitHub-only account (no password, no verified
     * recovery email) to still be able to recover access.
     * </pre>
     */
    public patches.v1.Auth.GenerateRecoveryCodesResponse generateRecoveryCodes(patches.v1.Auth.GenerateRecoveryCodesRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getGenerateRecoveryCodesMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Consumes one single-use recovery code and returns a session, the same way `Login` does for
     * a password (P15-003). The redeemed code is immediately revoked so it cannot be replayed;
     * the account's other unused codes remain valid. Always issues the same generic-failure
     * error as `Login` on a bad handle/code combination, for the same no-enumeration reason.
     * </pre>
     */
    public patches.v1.Auth.RecoveryLoginResponse recoveryLogin(patches.v1.Auth.RecoveryLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRecoveryLoginMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Passkeys/WebAuthn (P15-004, ADR 0022, `docs/architecture/auth.md`). Web-client-only — the
     * TUI has no browser relying party and none is planned (ADR 0011, ADR 0022). Every payload
     * here is the corresponding `&#64;simplewebauthn/&#42;` JSON type carried verbatim as an opaque
     * `string`, rather than a field-by-field proto mirror of the WebAuthn spec's own options/
     * response objects — see `docs/research/simplewebauthn.md` for why. Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account, mirroring
     * `BeginSshEnrollment`/`AddCredential(SSH_PUBLIC_KEY)`'s possession-proof shape.
     * </pre>
     */
    public patches.v1.Auth.BeginPasskeyRegistrationResponse beginPasskeyRegistration(patches.v1.Auth.BeginPasskeyRegistrationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginPasskeyRegistrationMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.CompletePasskeyRegistrationResponse completePasskeyRegistration(patches.v1.Auth.CompletePasskeyRegistrationRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompletePasskeyRegistrationMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Unauthenticated, discoverable-credential login (no username/handle is ever supplied or
     * required) — the credential response itself identifies the account via its WebAuthn
     * credential id. `BeginPasskeyLogin` always issues a challenge (mirrors `BeginSshLogin`'s
     * no-enumeration rule, though there is nothing to enumerate here since no identifier is ever
     * supplied); `CompletePasskeyLogin` verifies the assertion and returns a session. A sign-count
     * regression is treated as a possible credential clone: rejected with the same uniform
     * `AUTH_INVALID_CREDENTIALS` every other auth failure here uses, and a `SECURITY`
     * notification is written (mirrors `RecoveryLogin`'s convention).
     * </pre>
     */
    public patches.v1.Auth.BeginPasskeyLoginResponse beginPasskeyLogin(patches.v1.Auth.BeginPasskeyLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getBeginPasskeyLoginMethod(), getCallOptions(), request);
    }

    /**
     */
    public patches.v1.Auth.CompletePasskeyLoginResponse completePasskeyLogin(patches.v1.Auth.CompletePasskeyLoginRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getCompletePasskeyLoginMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service AuthService.
   * <pre>
   * Local account authentication and credential management (spec §33–39, §48, and Amendment A
   * §162, §165–168). Session issuance/rotation only — `ActorService` owns profile data,
   * `SocialGraphService` owns follow/mute/block state.
   * A credential proves you are a user; it is not who you are (§165). One user account may
   * hold several credentials (password, SSH keys, GitHub) side by side, and every login RPC
   * below returns the same `Session` envelope regardless of which credential was used.
   * </pre>
   */
  public static final class AuthServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<AuthServiceFutureStub> {
    private AuthServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected AuthServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new AuthServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Always unauthenticated, always cheap (P15-002): what credential types this node currently
     * accepts. A client MUST call this — or read `password_auth` off a cached recent call —
     * before rendering any password field on a login or register screen, and hide that field
     * entirely (not merely disable it) when the answer is `PASSWORD_AUTH_MODE_OFF`. Kept on
     * `AuthService` rather than `NodeService.GetNodeInfo`/`GetNodePolicy` (§163, §197.6) even
     * though it is conceptually node policy, so this credential-focused capability lives next to
     * the RPCs it actually gates (`Login`, `Register`, `AddCredential`).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.GetAuthPolicyResponse> getAuthPolicy(
        patches.v1.Auth.GetAuthPolicyRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetAuthPolicyMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Invite-gated in v0 (spec §33). Accepts an optional initial credential beyond the
     * password (`ssh_public_key`) so SSH-first registration never has to pass through a
     * password. Returns an active session even though the account's recovery email (if any)
     * is not yet verified — see `Session.email_verified`.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.RegisterResponse> register(
        patches.v1.Auth.RegisterRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRegisterMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Consumes a single-use verification code for the account's recovery email (spec §38,
     * §165 — applies only to accounts with a verified/verifiable recovery email).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.VerifyEmailResponse> verifyEmail(
        patches.v1.Auth.VerifyEmailRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getVerifyEmailMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Re-issues a verification code for the *authenticated caller's* account (the
     * `authorization` metadata identifies the account — there is no unauthenticated resend so
     * as to avoid leaking whether an email is registered, spec §177).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.ResendVerificationResponse> resendVerification(
        patches.v1.Auth.ResendVerificationRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getResendVerificationMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * The **password** login (spec §168). Kept as a dedicated RPC, not a polymorphic
     * grab-bag of credential types — SSH and GitHub each get their own RPC pair below.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.LoginResponse> login(
        patches.v1.Auth.LoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getLoginMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Rotates the refresh token (spec §36). Reuse of an already-rotated token revokes the
     * whole session family.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.RefreshSessionResponse> refreshSession(
        patches.v1.Auth.RefreshSessionRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRefreshSessionMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Revokes the session tied to the given refresh token.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.LogoutResponse> logout(
        patches.v1.Auth.LogoutRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getLogoutMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Revokes every session for the authenticated caller's account.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.LogoutAllSessionsResponse> logoutAllSessions(
        patches.v1.Auth.LogoutAllSessionsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getLogoutAllSessionsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Applies only to accounts with a verified recovery email (spec §165). Always returns
     * success regardless of whether `email` is registered, to avoid account enumeration.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.RequestPasswordResetResponse> requestPasswordReset(
        patches.v1.Auth.RequestPasswordResetRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRequestPasswordResetMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Consumes a single-use `password_reset_codes` row.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.ResetPasswordResponse> resetPassword(
        patches.v1.Auth.ResetPasswordRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getResetPasswordMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Returns session/actor info for the caller's current access token.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.GetCurrentSessionResponse> getCurrentSession(
        patches.v1.Auth.GetCurrentSessionRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGetCurrentSessionMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * SSH public-key login (spec §166). `BeginSshLogin` issues a single-use, short-TTL
     * challenge; the client has its SSH agent sign it; `CompleteSshLogin` verifies the
     * signature over the exact reconstructed blob and returns a session. Never reads,
     * requests, or transmits a private key — signing happens in the agent.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.BeginSshLoginResponse> beginSshLogin(
        patches.v1.Auth.BeginSshLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginSshLoginMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.CompleteSshLoginResponse> completeSshLogin(
        patches.v1.Auth.CompleteSshLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCompleteSshLoginMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * GitHub credential via OAuth device flow (spec §167) — GitHub is a credential, never an
     * identity; no profile field is ever populated from it automatically. `BeginGitHubLogin`
     * starts the device flow, `PollGitHubLogin` is polled at the returned `interval` until a
     * terminal status. Schema-only in Phase 1 — the implementation lands in Phase 6 (spec
     * §176), once the URL/timeout/SSRF validation baseline for outbound HTTP calls exists.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.BeginGitHubLoginResponse> beginGitHubLogin(
        patches.v1.Auth.BeginGitHubLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginGitHubLoginMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.PollGitHubLoginResponse> pollGitHubLogin(
        patches.v1.Auth.PollGitHubLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPollGitHubLoginMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Generic OIDC device flow (P15-006, spec §167 extended to "any OIDC-device-flow provider,
     * not just GitHub") — GitLab, Codeberg, or any other node-configured provider. `provider`
     * selects one of `GetAuthPolicyResponse.oidc_providers` by id; an unknown or unconfigured id
     * fails the same way an unconfigured GitHub client id does. Exactly the same credential-not-
     * identity contract as `BeginGitHubLogin`/`PollGitHubLogin`: no profile field is ever
     * populated from it automatically, and `identifier` is namespaced per provider so two
     * providers' subjects can never collide.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.BeginOidcLoginResponse> beginOidcLogin(
        patches.v1.Auth.BeginOidcLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginOidcLoginMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.PollOidcLoginResponse> pollOidcLogin(
        patches.v1.Auth.PollOidcLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPollOidcLoginMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * P15-005: a browser cannot prove possession of an SSH key, but the terminal it is already
     * signed in from can. `BeginDeviceLink` is unauthenticated (any browser tab may start one) and
     * returns two codes: `device_code`, a long secret the browser alone holds and polls with, and
     * `user_code`, a short code it displays for a human to read and type. There is no third party
     * and no central SSO anywhere in this flow — it is one node mediating between two of the same
     * user's own devices.
     * The account holder runs `patches approve &lt;user_code&gt;` from a terminal session that is
     * *already signed in* — `ApproveDeviceLink` requires the `authorization` metadata a signed-in
     * CLI already carries, exactly like `AddCredential`'s "linking requires an authenticated
     * session" rule (spec §167). It binds the pending link to that caller's account and nothing
     * else; the browser never learns which account approved it except by receiving that account's
     * own session once it does. A missing, unknown, expired, or already-approved `user_code` is
     * rejected uniformly — the code is single-use.
     * `PollDeviceLink` is the unauthenticated browser-side poll on `device_code`, mirroring
     * `PollGitHubLogin`/`PollOidcLogin`'s shape (`PENDING`/`SLOW_DOWN`/`EXPIRED`/`COMPLETE`).
     * Because `user_code` is short enough for a human to type, it MUST be short-TTL, single-use,
     * and rate-limited on both `BeginDeviceLink` and `ApproveDeviceLink` server-side — the CLI
     * additionally shows the code back to the user and asks them to confirm before calling
     * `ApproveDeviceLink`, since nothing server-side can distinguish an account holder approving
     * their own login from one talked into approving someone else's by social engineering.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.BeginDeviceLinkResponse> beginDeviceLink(
        patches.v1.Auth.BeginDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginDeviceLinkMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.PollDeviceLinkResponse> pollDeviceLink(
        patches.v1.Auth.PollDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getPollDeviceLinkMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.ApproveDeviceLinkResponse> approveDeviceLink(
        patches.v1.Auth.ApproveDeviceLinkRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getApproveDeviceLinkMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Credential management (spec §165). `ListCredentials` never returns `secret_hash` or any
     * other secret material — type, label, identifier, timestamps only.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.ListCredentialsResponse> listCredentials(
        patches.v1.Auth.ListCredentialsRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getListCredentialsMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * SSH credential enrollment challenge (spec §165-166, B-021). Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account and the fingerprint of
     * `public_key_openssh`, mirroring `BeginSshLogin`/`CompleteSshLogin`'s shape so
     * `AddCredential(SSH_PUBLIC_KEY)` can require a real possession proof (`SshEnrollmentProof`)
     * instead of trusting the client's own local check.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.BeginSshEnrollmentResponse> beginSshEnrollment(
        patches.v1.Auth.BeginSshEnrollmentRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginSshEnrollmentMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Adds a PASSWORD or SSH_PUBLIC_KEY credential to the authenticated caller's account.
     * GITHUB credentials are linked via `BeginGitHubLogin`/`PollGitHubLogin` called with an
     * authenticated session instead, not through this RPC (spec §167's "linking ... MUST
     * require an authenticated Patches session"). SSH_PUBLIC_KEY MUST carry `ssh_proof` from a
     * prior `BeginSshEnrollment` call (B-021); a missing, expired, replayed, or key-mismatched
     * proof is rejected.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.AddCredentialResponse> addCredential(
        patches.v1.Auth.AddCredentialRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getAddCredentialMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Revoking a user's last active credential MUST fail server-side (spec §165) — an account
     * must always retain a way in.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.RevokeCredentialResponse> revokeCredential(
        patches.v1.Auth.RevokeCredentialRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRevokeCredentialMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Mints a fresh set of 10 single-use recovery codes for the authenticated caller, replacing
     * (revoking) any codes generated previously (P15-003, spec §165). Codes are returned exactly
     * once, in this response, and only their Argon2id hash is ever stored — there is no
     * `GetRecoveryCodes`. Meant for an SSH/GitHub-only account (no password, no verified
     * recovery email) to still be able to recover access.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.GenerateRecoveryCodesResponse> generateRecoveryCodes(
        patches.v1.Auth.GenerateRecoveryCodesRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getGenerateRecoveryCodesMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Consumes one single-use recovery code and returns a session, the same way `Login` does for
     * a password (P15-003). The redeemed code is immediately revoked so it cannot be replayed;
     * the account's other unused codes remain valid. Always issues the same generic-failure
     * error as `Login` on a bad handle/code combination, for the same no-enumeration reason.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.RecoveryLoginResponse> recoveryLogin(
        patches.v1.Auth.RecoveryLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRecoveryLoginMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Passkeys/WebAuthn (P15-004, ADR 0022, `docs/architecture/auth.md`). Web-client-only — the
     * TUI has no browser relying party and none is planned (ADR 0011, ADR 0022). Every payload
     * here is the corresponding `&#64;simplewebauthn/&#42;` JSON type carried verbatim as an opaque
     * `string`, rather than a field-by-field proto mirror of the WebAuthn spec's own options/
     * response objects — see `docs/research/simplewebauthn.md` for why. Authenticated: issues a
     * single-use, short-TTL challenge bound to the caller's own account, mirroring
     * `BeginSshEnrollment`/`AddCredential(SSH_PUBLIC_KEY)`'s possession-proof shape.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.BeginPasskeyRegistrationResponse> beginPasskeyRegistration(
        patches.v1.Auth.BeginPasskeyRegistrationRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginPasskeyRegistrationMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.CompletePasskeyRegistrationResponse> completePasskeyRegistration(
        patches.v1.Auth.CompletePasskeyRegistrationRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCompletePasskeyRegistrationMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Unauthenticated, discoverable-credential login (no username/handle is ever supplied or
     * required) — the credential response itself identifies the account via its WebAuthn
     * credential id. `BeginPasskeyLogin` always issues a challenge (mirrors `BeginSshLogin`'s
     * no-enumeration rule, though there is nothing to enumerate here since no identifier is ever
     * supplied); `CompletePasskeyLogin` verifies the assertion and returns a session. A sign-count
     * regression is treated as a possible credential clone: rejected with the same uniform
     * `AUTH_INVALID_CREDENTIALS` every other auth failure here uses, and a `SECURITY`
     * notification is written (mirrors `RecoveryLogin`'s convention).
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.BeginPasskeyLoginResponse> beginPasskeyLogin(
        patches.v1.Auth.BeginPasskeyLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getBeginPasskeyLoginMethod(), getCallOptions()), request);
    }

    /**
     */
    public com.google.common.util.concurrent.ListenableFuture<patches.v1.Auth.CompletePasskeyLoginResponse> completePasskeyLogin(
        patches.v1.Auth.CompletePasskeyLoginRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getCompletePasskeyLoginMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_GET_AUTH_POLICY = 0;
  private static final int METHODID_REGISTER = 1;
  private static final int METHODID_VERIFY_EMAIL = 2;
  private static final int METHODID_RESEND_VERIFICATION = 3;
  private static final int METHODID_LOGIN = 4;
  private static final int METHODID_REFRESH_SESSION = 5;
  private static final int METHODID_LOGOUT = 6;
  private static final int METHODID_LOGOUT_ALL_SESSIONS = 7;
  private static final int METHODID_REQUEST_PASSWORD_RESET = 8;
  private static final int METHODID_RESET_PASSWORD = 9;
  private static final int METHODID_GET_CURRENT_SESSION = 10;
  private static final int METHODID_BEGIN_SSH_LOGIN = 11;
  private static final int METHODID_COMPLETE_SSH_LOGIN = 12;
  private static final int METHODID_BEGIN_GIT_HUB_LOGIN = 13;
  private static final int METHODID_POLL_GIT_HUB_LOGIN = 14;
  private static final int METHODID_BEGIN_OIDC_LOGIN = 15;
  private static final int METHODID_POLL_OIDC_LOGIN = 16;
  private static final int METHODID_BEGIN_DEVICE_LINK = 17;
  private static final int METHODID_POLL_DEVICE_LINK = 18;
  private static final int METHODID_APPROVE_DEVICE_LINK = 19;
  private static final int METHODID_LIST_CREDENTIALS = 20;
  private static final int METHODID_BEGIN_SSH_ENROLLMENT = 21;
  private static final int METHODID_ADD_CREDENTIAL = 22;
  private static final int METHODID_REVOKE_CREDENTIAL = 23;
  private static final int METHODID_GENERATE_RECOVERY_CODES = 24;
  private static final int METHODID_RECOVERY_LOGIN = 25;
  private static final int METHODID_BEGIN_PASSKEY_REGISTRATION = 26;
  private static final int METHODID_COMPLETE_PASSKEY_REGISTRATION = 27;
  private static final int METHODID_BEGIN_PASSKEY_LOGIN = 28;
  private static final int METHODID_COMPLETE_PASSKEY_LOGIN = 29;

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
        case METHODID_GET_AUTH_POLICY:
          serviceImpl.getAuthPolicy((patches.v1.Auth.GetAuthPolicyRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.GetAuthPolicyResponse>) responseObserver);
          break;
        case METHODID_REGISTER:
          serviceImpl.register((patches.v1.Auth.RegisterRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.RegisterResponse>) responseObserver);
          break;
        case METHODID_VERIFY_EMAIL:
          serviceImpl.verifyEmail((patches.v1.Auth.VerifyEmailRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.VerifyEmailResponse>) responseObserver);
          break;
        case METHODID_RESEND_VERIFICATION:
          serviceImpl.resendVerification((patches.v1.Auth.ResendVerificationRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.ResendVerificationResponse>) responseObserver);
          break;
        case METHODID_LOGIN:
          serviceImpl.login((patches.v1.Auth.LoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.LoginResponse>) responseObserver);
          break;
        case METHODID_REFRESH_SESSION:
          serviceImpl.refreshSession((patches.v1.Auth.RefreshSessionRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.RefreshSessionResponse>) responseObserver);
          break;
        case METHODID_LOGOUT:
          serviceImpl.logout((patches.v1.Auth.LogoutRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.LogoutResponse>) responseObserver);
          break;
        case METHODID_LOGOUT_ALL_SESSIONS:
          serviceImpl.logoutAllSessions((patches.v1.Auth.LogoutAllSessionsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.LogoutAllSessionsResponse>) responseObserver);
          break;
        case METHODID_REQUEST_PASSWORD_RESET:
          serviceImpl.requestPasswordReset((patches.v1.Auth.RequestPasswordResetRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.RequestPasswordResetResponse>) responseObserver);
          break;
        case METHODID_RESET_PASSWORD:
          serviceImpl.resetPassword((patches.v1.Auth.ResetPasswordRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.ResetPasswordResponse>) responseObserver);
          break;
        case METHODID_GET_CURRENT_SESSION:
          serviceImpl.getCurrentSession((patches.v1.Auth.GetCurrentSessionRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.GetCurrentSessionResponse>) responseObserver);
          break;
        case METHODID_BEGIN_SSH_LOGIN:
          serviceImpl.beginSshLogin((patches.v1.Auth.BeginSshLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.BeginSshLoginResponse>) responseObserver);
          break;
        case METHODID_COMPLETE_SSH_LOGIN:
          serviceImpl.completeSshLogin((patches.v1.Auth.CompleteSshLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.CompleteSshLoginResponse>) responseObserver);
          break;
        case METHODID_BEGIN_GIT_HUB_LOGIN:
          serviceImpl.beginGitHubLogin((patches.v1.Auth.BeginGitHubLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.BeginGitHubLoginResponse>) responseObserver);
          break;
        case METHODID_POLL_GIT_HUB_LOGIN:
          serviceImpl.pollGitHubLogin((patches.v1.Auth.PollGitHubLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.PollGitHubLoginResponse>) responseObserver);
          break;
        case METHODID_BEGIN_OIDC_LOGIN:
          serviceImpl.beginOidcLogin((patches.v1.Auth.BeginOidcLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.BeginOidcLoginResponse>) responseObserver);
          break;
        case METHODID_POLL_OIDC_LOGIN:
          serviceImpl.pollOidcLogin((patches.v1.Auth.PollOidcLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.PollOidcLoginResponse>) responseObserver);
          break;
        case METHODID_BEGIN_DEVICE_LINK:
          serviceImpl.beginDeviceLink((patches.v1.Auth.BeginDeviceLinkRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.BeginDeviceLinkResponse>) responseObserver);
          break;
        case METHODID_POLL_DEVICE_LINK:
          serviceImpl.pollDeviceLink((patches.v1.Auth.PollDeviceLinkRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.PollDeviceLinkResponse>) responseObserver);
          break;
        case METHODID_APPROVE_DEVICE_LINK:
          serviceImpl.approveDeviceLink((patches.v1.Auth.ApproveDeviceLinkRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.ApproveDeviceLinkResponse>) responseObserver);
          break;
        case METHODID_LIST_CREDENTIALS:
          serviceImpl.listCredentials((patches.v1.Auth.ListCredentialsRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.ListCredentialsResponse>) responseObserver);
          break;
        case METHODID_BEGIN_SSH_ENROLLMENT:
          serviceImpl.beginSshEnrollment((patches.v1.Auth.BeginSshEnrollmentRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.BeginSshEnrollmentResponse>) responseObserver);
          break;
        case METHODID_ADD_CREDENTIAL:
          serviceImpl.addCredential((patches.v1.Auth.AddCredentialRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.AddCredentialResponse>) responseObserver);
          break;
        case METHODID_REVOKE_CREDENTIAL:
          serviceImpl.revokeCredential((patches.v1.Auth.RevokeCredentialRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.RevokeCredentialResponse>) responseObserver);
          break;
        case METHODID_GENERATE_RECOVERY_CODES:
          serviceImpl.generateRecoveryCodes((patches.v1.Auth.GenerateRecoveryCodesRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.GenerateRecoveryCodesResponse>) responseObserver);
          break;
        case METHODID_RECOVERY_LOGIN:
          serviceImpl.recoveryLogin((patches.v1.Auth.RecoveryLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.RecoveryLoginResponse>) responseObserver);
          break;
        case METHODID_BEGIN_PASSKEY_REGISTRATION:
          serviceImpl.beginPasskeyRegistration((patches.v1.Auth.BeginPasskeyRegistrationRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.BeginPasskeyRegistrationResponse>) responseObserver);
          break;
        case METHODID_COMPLETE_PASSKEY_REGISTRATION:
          serviceImpl.completePasskeyRegistration((patches.v1.Auth.CompletePasskeyRegistrationRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.CompletePasskeyRegistrationResponse>) responseObserver);
          break;
        case METHODID_BEGIN_PASSKEY_LOGIN:
          serviceImpl.beginPasskeyLogin((patches.v1.Auth.BeginPasskeyLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.BeginPasskeyLoginResponse>) responseObserver);
          break;
        case METHODID_COMPLETE_PASSKEY_LOGIN:
          serviceImpl.completePasskeyLogin((patches.v1.Auth.CompletePasskeyLoginRequest) request,
              (io.grpc.stub.StreamObserver<patches.v1.Auth.CompletePasskeyLoginResponse>) responseObserver);
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
          getGetAuthPolicyMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.GetAuthPolicyRequest,
              patches.v1.Auth.GetAuthPolicyResponse>(
                service, METHODID_GET_AUTH_POLICY)))
        .addMethod(
          getRegisterMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.RegisterRequest,
              patches.v1.Auth.RegisterResponse>(
                service, METHODID_REGISTER)))
        .addMethod(
          getVerifyEmailMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.VerifyEmailRequest,
              patches.v1.Auth.VerifyEmailResponse>(
                service, METHODID_VERIFY_EMAIL)))
        .addMethod(
          getResendVerificationMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.ResendVerificationRequest,
              patches.v1.Auth.ResendVerificationResponse>(
                service, METHODID_RESEND_VERIFICATION)))
        .addMethod(
          getLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.LoginRequest,
              patches.v1.Auth.LoginResponse>(
                service, METHODID_LOGIN)))
        .addMethod(
          getRefreshSessionMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.RefreshSessionRequest,
              patches.v1.Auth.RefreshSessionResponse>(
                service, METHODID_REFRESH_SESSION)))
        .addMethod(
          getLogoutMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.LogoutRequest,
              patches.v1.Auth.LogoutResponse>(
                service, METHODID_LOGOUT)))
        .addMethod(
          getLogoutAllSessionsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.LogoutAllSessionsRequest,
              patches.v1.Auth.LogoutAllSessionsResponse>(
                service, METHODID_LOGOUT_ALL_SESSIONS)))
        .addMethod(
          getRequestPasswordResetMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.RequestPasswordResetRequest,
              patches.v1.Auth.RequestPasswordResetResponse>(
                service, METHODID_REQUEST_PASSWORD_RESET)))
        .addMethod(
          getResetPasswordMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.ResetPasswordRequest,
              patches.v1.Auth.ResetPasswordResponse>(
                service, METHODID_RESET_PASSWORD)))
        .addMethod(
          getGetCurrentSessionMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.GetCurrentSessionRequest,
              patches.v1.Auth.GetCurrentSessionResponse>(
                service, METHODID_GET_CURRENT_SESSION)))
        .addMethod(
          getBeginSshLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.BeginSshLoginRequest,
              patches.v1.Auth.BeginSshLoginResponse>(
                service, METHODID_BEGIN_SSH_LOGIN)))
        .addMethod(
          getCompleteSshLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.CompleteSshLoginRequest,
              patches.v1.Auth.CompleteSshLoginResponse>(
                service, METHODID_COMPLETE_SSH_LOGIN)))
        .addMethod(
          getBeginGitHubLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.BeginGitHubLoginRequest,
              patches.v1.Auth.BeginGitHubLoginResponse>(
                service, METHODID_BEGIN_GIT_HUB_LOGIN)))
        .addMethod(
          getPollGitHubLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.PollGitHubLoginRequest,
              patches.v1.Auth.PollGitHubLoginResponse>(
                service, METHODID_POLL_GIT_HUB_LOGIN)))
        .addMethod(
          getBeginOidcLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.BeginOidcLoginRequest,
              patches.v1.Auth.BeginOidcLoginResponse>(
                service, METHODID_BEGIN_OIDC_LOGIN)))
        .addMethod(
          getPollOidcLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.PollOidcLoginRequest,
              patches.v1.Auth.PollOidcLoginResponse>(
                service, METHODID_POLL_OIDC_LOGIN)))
        .addMethod(
          getBeginDeviceLinkMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.BeginDeviceLinkRequest,
              patches.v1.Auth.BeginDeviceLinkResponse>(
                service, METHODID_BEGIN_DEVICE_LINK)))
        .addMethod(
          getPollDeviceLinkMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.PollDeviceLinkRequest,
              patches.v1.Auth.PollDeviceLinkResponse>(
                service, METHODID_POLL_DEVICE_LINK)))
        .addMethod(
          getApproveDeviceLinkMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.ApproveDeviceLinkRequest,
              patches.v1.Auth.ApproveDeviceLinkResponse>(
                service, METHODID_APPROVE_DEVICE_LINK)))
        .addMethod(
          getListCredentialsMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.ListCredentialsRequest,
              patches.v1.Auth.ListCredentialsResponse>(
                service, METHODID_LIST_CREDENTIALS)))
        .addMethod(
          getBeginSshEnrollmentMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.BeginSshEnrollmentRequest,
              patches.v1.Auth.BeginSshEnrollmentResponse>(
                service, METHODID_BEGIN_SSH_ENROLLMENT)))
        .addMethod(
          getAddCredentialMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.AddCredentialRequest,
              patches.v1.Auth.AddCredentialResponse>(
                service, METHODID_ADD_CREDENTIAL)))
        .addMethod(
          getRevokeCredentialMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.RevokeCredentialRequest,
              patches.v1.Auth.RevokeCredentialResponse>(
                service, METHODID_REVOKE_CREDENTIAL)))
        .addMethod(
          getGenerateRecoveryCodesMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.GenerateRecoveryCodesRequest,
              patches.v1.Auth.GenerateRecoveryCodesResponse>(
                service, METHODID_GENERATE_RECOVERY_CODES)))
        .addMethod(
          getRecoveryLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.RecoveryLoginRequest,
              patches.v1.Auth.RecoveryLoginResponse>(
                service, METHODID_RECOVERY_LOGIN)))
        .addMethod(
          getBeginPasskeyRegistrationMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.BeginPasskeyRegistrationRequest,
              patches.v1.Auth.BeginPasskeyRegistrationResponse>(
                service, METHODID_BEGIN_PASSKEY_REGISTRATION)))
        .addMethod(
          getCompletePasskeyRegistrationMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.CompletePasskeyRegistrationRequest,
              patches.v1.Auth.CompletePasskeyRegistrationResponse>(
                service, METHODID_COMPLETE_PASSKEY_REGISTRATION)))
        .addMethod(
          getBeginPasskeyLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.BeginPasskeyLoginRequest,
              patches.v1.Auth.BeginPasskeyLoginResponse>(
                service, METHODID_BEGIN_PASSKEY_LOGIN)))
        .addMethod(
          getCompletePasskeyLoginMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              patches.v1.Auth.CompletePasskeyLoginRequest,
              patches.v1.Auth.CompletePasskeyLoginResponse>(
                service, METHODID_COMPLETE_PASSKEY_LOGIN)))
        .build();
  }

  private static abstract class AuthServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    AuthServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return patches.v1.Auth.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("AuthService");
    }
  }

  private static final class AuthServiceFileDescriptorSupplier
      extends AuthServiceBaseDescriptorSupplier {
    AuthServiceFileDescriptorSupplier() {}
  }

  private static final class AuthServiceMethodDescriptorSupplier
      extends AuthServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    AuthServiceMethodDescriptorSupplier(java.lang.String methodName) {
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
      synchronized (AuthServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new AuthServiceFileDescriptorSupplier())
              .addMethod(getGetAuthPolicyMethod())
              .addMethod(getRegisterMethod())
              .addMethod(getVerifyEmailMethod())
              .addMethod(getResendVerificationMethod())
              .addMethod(getLoginMethod())
              .addMethod(getRefreshSessionMethod())
              .addMethod(getLogoutMethod())
              .addMethod(getLogoutAllSessionsMethod())
              .addMethod(getRequestPasswordResetMethod())
              .addMethod(getResetPasswordMethod())
              .addMethod(getGetCurrentSessionMethod())
              .addMethod(getBeginSshLoginMethod())
              .addMethod(getCompleteSshLoginMethod())
              .addMethod(getBeginGitHubLoginMethod())
              .addMethod(getPollGitHubLoginMethod())
              .addMethod(getBeginOidcLoginMethod())
              .addMethod(getPollOidcLoginMethod())
              .addMethod(getBeginDeviceLinkMethod())
              .addMethod(getPollDeviceLinkMethod())
              .addMethod(getApproveDeviceLinkMethod())
              .addMethod(getListCredentialsMethod())
              .addMethod(getBeginSshEnrollmentMethod())
              .addMethod(getAddCredentialMethod())
              .addMethod(getRevokeCredentialMethod())
              .addMethod(getGenerateRecoveryCodesMethod())
              .addMethod(getRecoveryLoginMethod())
              .addMethod(getBeginPasskeyRegistrationMethod())
              .addMethod(getCompletePasskeyRegistrationMethod())
              .addMethod(getBeginPasskeyLoginMethod())
              .addMethod(getCompletePasskeyLoginMethod())
              .build();
        }
      }
    }
    return result;
  }
}
