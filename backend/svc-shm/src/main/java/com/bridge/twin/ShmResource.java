package com.bridge.twin;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 文档 8.2 监测与告警、8.4 历史回放接口 */
@Path("/api/v1")
@Produces(MediaType.APPLICATION_JSON)
public class ShmResource {

    @Inject
    RuntimeState state;

    @GET
    @Path("/bridges/{code}/metrics")
    public ApiResponse<?> metrics(@PathParam("code") String code) {
        return ApiResponse.ok(state.metrics());
    }

    @GET
    @Path("/points")
    public ApiResponse<?> points(@QueryParam("bridgeCode") String bridgeCode,
                                 @QueryParam("groupCode") String group) {
        return ApiResponse.ok(state.points(group));
    }

    @POST
    @Path("/points/realtime")
    @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponse<?> batchRealtime(Object body) {
        List<Map<String, Object>> list = asList(body);
        return ApiResponse.ok(SeedDataMini.o("accepted", state.ingest(list), "received", list.size()));
    }

    @GET
    @Path("/points/{pointCode}/realtime")
    public ApiResponse<?> realtime(@PathParam("pointCode") String pointCode) {
        Map<String, Object> rt = state.realtime(pointCode);
        return rt == null ? ApiResponse.fail("测点不存在: " + pointCode) : ApiResponse.ok(rt);
    }

    @GET
    @Path("/alarms")
    public ApiResponse<?> alarms(@QueryParam("bridgeCode") String bridgeCode,
                                 @QueryParam("level") String level,
                                 @QueryParam("status") String status) {
        List<Map<String, Object>> list = state.alarms(level, status);
        return ApiResponse.ok(SeedDataMini.o("list", list, "total", list.size()));
    }

    @POST
    @Path("/alarms/{alarmCode}/confirm")
    public ApiResponse<?> confirm(@PathParam("alarmCode") String alarmCode) {
        Map<String, Object> a = state.setAlarmStatus(alarmCode, "CONFIRMED");
        return a == null ? ApiResponse.fail("告警不存在") : ApiResponse.ok(a);
    }

    @POST
    @Path("/alarms/{alarmCode}/ignore")
    public ApiResponse<?> ignore(@PathParam("alarmCode") String alarmCode) {
        Map<String, Object> a = state.setAlarmStatus(alarmCode, "IGNORED");
        return a == null ? ApiResponse.fail("告警不存在") : ApiResponse.ok(a);
    }

    @GET
    @Path("/bridges/{code}/health")
    public ApiResponse<?> health(@PathParam("code") String code) {
        return ApiResponse.ok(state.health());
    }

    @GET
    @Path("/bridges/{code}/inspections")
    public ApiResponse<?> inspections(@PathParam("code") String code) {
        return ApiResponse.ok(List.of(SeedDataMini.inspection()));
    }

    @GET
    @Path("/history/series")
    public ApiResponse<?> series(@QueryParam("points") @DefaultValue("PTS-C-01") String points,
                                 @QueryParam("start") Long start,
                                 @QueryParam("end") Long end,
                                 @QueryParam("interval") @DefaultValue("10s") String interval,
                                 @QueryParam("aggr") @DefaultValue("AVG") String aggr) {
        long now = System.currentTimeMillis();
        long to = end == null ? now : end;
        long from = start == null ? to - 24 * 3_600_000L : start;
        return ApiResponse.ok(state.series(points, from, to, parseInterval(interval), aggr));
    }

    @GET
    @Path("/history/statistics")
    public ApiResponse<?> statistics(@QueryParam("point") @DefaultValue("PTS-C-01") String point,
                                     @QueryParam("start") Long start,
                                     @QueryParam("end") Long end) {
        long now = System.currentTimeMillis();
        long to = end == null ? now : end;
        long from = start == null ? to - 24 * 3_600_000L : start;
        return ApiResponse.ok(state.statistics(point, from, to));
    }

    @GET
    @Path("/history/snapshot")
    public ApiResponse<?> snapshot(@QueryParam("t") Long t) {
        return ApiResponse.ok(state.snapshotAt(t == null ? System.currentTimeMillis() : t));
    }

    /** 清洗入口：无 MQTT 时可直接 HTTP 上报原始报文 */
    @POST
    @Path("/sensor/ingest")
    @Consumes(MediaType.APPLICATION_JSON)
    public ApiResponse<?> ingest(Object body) {
        List<Map<String, Object>> list = asList(body);
        return ApiResponse.ok(SeedDataMini.o("accepted", state.ingest(list), "received", list.size()));
    }

    @GET
    @Path("/system/stats")
    public ApiResponse<?> stats() { return ApiResponse.ok(state.ingestStats()); }

    @GET
    @Path("/snapshot")
    public ApiResponse<?> snapshotNow() { return ApiResponse.ok(state.snapshot()); }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asList(Object body) {
        if (body instanceof List<?> list) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object o : list) if (o instanceof Map<?, ?> m) out.add(toStringMap(m));
            return out;
        }
        if (body instanceof Map<?, ?> map) {
            Object points = map.get("points");
            if (points instanceof List<?> list) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object o : list) if (o instanceof Map<?, ?> m) out.add(toStringMap(m));
                return out;
            }
            if (map.containsKey("pointCode")) return List.of(toStringMap(map));
        }
        return List.of();
    }

    private Map<String, Object> toStringMap(Map<?, ?> src) {
        Map<String, Object> out = new LinkedHashMap<>();
        src.forEach((k, v) -> out.put(String.valueOf(k), v));
        return out;
    }

    private long parseInterval(String s) {
        String v = s.trim().toLowerCase();
        long mult = v.endsWith("h") ? 3_600_000L : v.endsWith("m") ? 60_000L : v.endsWith("s") ? 1000L : 1L;
        try {
            double n = Double.parseDouble(v.replaceAll("[a-z]", ""));
            return Math.max(1000L, (long) (n * mult));
        } catch (NumberFormatException e) {
            return 10_000L;
        }
    }
}
