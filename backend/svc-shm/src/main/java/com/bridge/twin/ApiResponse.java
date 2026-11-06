package com.bridge.twin;

import java.util.UUID;

public record ApiResponse<T>(int code, String msg, T data, String traceId) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(0, "ok", data, UUID.randomUUID().toString().substring(0, 8));
    }

    public static <T> ApiResponse<T> fail(String msg) {
        return new ApiResponse<>(1, msg, null, UUID.randomUUID().toString().substring(0, 8));
    }
}
