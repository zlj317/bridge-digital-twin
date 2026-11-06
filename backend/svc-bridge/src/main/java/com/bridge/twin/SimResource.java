package com.bridge.twin;

import jakarta.inject.Inject;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

/** 文档 8.3 仿真、车流统计与动画分幕接口 */
@Path("/api/v1")
@Produces(MediaType.APPLICATION_JSON)
public class SimResource {

    @Inject
    RuntimeStore store;

    @GET
    @Path("/sim/plans")
    public ApiResponse<?> plans() { return ApiResponse.ok(store.simPlans()); }

    @POST
    @Path("/sim/plans/{code}/start")
    public ApiResponse<?> start(@PathParam("code") String code) {
        return ApiResponse.ok(store.setPlan(code, "RUNNING", null));
    }

    @POST
    @Path("/sim/plans/{code}/stop")
    public ApiResponse<?> stop(@PathParam("code") String code) {
        return ApiResponse.ok(store.setPlan(code, "STOPPED", null));
    }

    @PUT
    @Path("/sim/plans/{code}/density")
    public ApiResponse<?> density(@PathParam("code") String code,
                                  @QueryParam("density") @DefaultValue("62") int density) {
        return ApiResponse.ok(store.setPlan(code, null, Math.max(0, Math.min(100, density))));
    }

    @GET
    @Path("/traffic/{code}/stat")
    public ApiResponse<?> trafficStat(@PathParam("code") String code) {
        return ApiResponse.ok(store.trafficStat());
    }

    @GET
    @Path("/anim/{code}/stages")
    public ApiResponse<?> stages(@PathParam("code") String code) {
        return ApiResponse.ok(SeedData.animStages());
    }

    @POST
    @Path("/anim/{code}/replay")
    public ApiResponse<?> replay(@PathParam("code") String code) {
        store.replay(code);
        return ApiResponse.ok(SeedData.o("ok", true, "replayedAt", System.currentTimeMillis()));
    }
}
