package com.bridge.twin;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.Map;

/** 文档 8.1 桥梁与构件接口 + BRG-001~010 */
@Path("/api/v1")
@Produces(MediaType.APPLICATION_JSON)
public class BridgeResource {

    @Inject
    RuntimeStore store;

    @GET
    @Path("/bridges")
    public ApiResponse<?> bridges(@QueryParam("page") @DefaultValue("1") int page,
                                  @QueryParam("size") @DefaultValue("20") int size) {
        List<Map<String, Object>> list = store.bridges(Math.max(1, page), Math.max(1, size));
        return ApiResponse.ok(SeedData.o("list", list, "total", list.size(), "page", page, "size", size));
    }

    @GET
    @Path("/bridges/{code}")
    public ApiResponse<?> bridge(@PathParam("code") String code) {
        Map<String, Object> b = store.bridge(code);
        return b == null ? ApiResponse.fail("桥梁不存在: " + code) : ApiResponse.ok(b);
    }

    @POST
    @Path("/bridges")
    @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponse<?> createBridge(Map<String, Object> body) {
        String code = String.valueOf(body.getOrDefault("bridgeCode", SeedData.BRIDGE_CODE));
        return ApiResponse.ok(store.upsertBridge(code, body));
    }

    @PUT
    @Path("/bridges/{code}")
    @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponse<?> updateBridge(@PathParam("code") String code, Map<String, Object> body) {
        return ApiResponse.ok(store.upsertBridge(code, body));
    }

    @DELETE
    @Path("/bridges/{code}")
    public ApiResponse<?> deleteBridge(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.o("deleted", store.deleteBridge(code)));
    }

    /** 首屏聚合：档案+车道+视点+五幕+构件树+模型 URL，一次拉完 */
    @GET
    @Path("/bridges/{code}/bootstrap")
    public ApiResponse<?> bootstrap(@PathParam("code") String code) {
        if (store.bridge(code) == null) return ApiResponse.fail("桥梁不存在: " + code);
        return ApiResponse.ok(store.bootstrap());
    }

    @GET
    @Path("/bridges/{code}/components")
    public ApiResponse<?> components(@PathParam("code") String code, @QueryParam("type") String type) {
        return ApiResponse.ok(store.components(type));
    }

    @GET
    @Path("/components/{compCode}")
    public ApiResponse<?> component(@PathParam("compCode") String compCode) {
        Map<String, Object> c = store.component(compCode);
        return c == null ? ApiResponse.fail("构件不存在: " + compCode) : ApiResponse.ok(c);
    }

    @POST
    @Path("/components")
    @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponse<?> createComponent(Map<String, Object> body) {
        return ApiResponse.ok(store.upsertComponent(body));
    }

    @PUT
    @Path("/components/{code}")
    @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponse<?> updateComponent(@PathParam("code") String code, Map<String, Object> body) {
        Map<String, Object> merged = new java.util.LinkedHashMap<>(body);
        merged.put("compCode", code);
        return ApiResponse.ok(store.upsertComponent(merged));
    }

    @GET
    @Path("/bridges/{code}/cables")
    public ApiResponse<?> cables(@PathParam("code") String code, @QueryParam("towerSide") String side) {
        List<Map<String, Object>> list = SeedData.cables();
        if (side != null && !side.isBlank()) {
            list = list.stream().filter(c -> side.equalsIgnoreCase(String.valueOf(c.get("towerSide")))).toList();
        }
        return ApiResponse.ok(list);
    }

    @GET
    @Path("/bridges/{code}/segments")
    public ApiResponse<?> segments(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.segments());
    }

    @GET
    @Path("/bridges/{code}/lanes")
    public ApiResponse<?> lanes(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.lanes());
    }

    @GET
    @Path("/bridges/{code}/viewpoints")
    public ApiResponse<?> viewpoints(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.viewpoints());
    }

    @GET
    @Path("/bridges/{code}/clip-plans")
    public ApiResponse<?> clipPlans(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.clipPlans());
    }

    @GET
    @Path("/bridges/{code}/anim-stages")
    public ApiResponse<?> animStages(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.animStages());
    }

    @GET
    @Path("/bridges/{code}/models")
    public ApiResponse<?> models(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.models());
    }

    /** BRG-010：GLB 上传登记（cluster 模式下写入 MinIO） */
    @POST
    @Path("/models/upload")
    @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponse<?> uploadModel(Map<String, Object> body) {
        return ApiResponse.ok(store.registerModel(body));
    }

    @GET
    @Path("/system/oper-logs")
    public ApiResponse<?> operLogs() {
        return ApiResponse.ok(store.operLogs());
    }
}
