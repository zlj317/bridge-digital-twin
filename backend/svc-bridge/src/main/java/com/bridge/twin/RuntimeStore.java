package com.bridge.twin;

import jakarta.enterprise.context.ApplicationScoped;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 仓储门面：默认内存实现（P0 无中间件即可联调）。
 * 设置 bdt.storage=cluster 时，可把下列方法替换为 JdbcRepository / Redis / MinIO 调用，
 * REST 契约与数据结构保持不变（文档 6.1「实时与历史分离」）。
 */
@ApplicationScoped
public class RuntimeStore {
    private final Map<String, Map<String, Object>> bridges = new ConcurrentHashMap<>();
    private final List<Map<String, Object>> components = new CopyOnWriteArrayList<>();
    private final Map<String, Map<String, Object>> simPlans = new ConcurrentHashMap<>();
    private final List<Map<String, Object>> operLogs = new CopyOnWriteArrayList<>();
    private volatile Map<String, Object> trafficStat = SeedData.o(
            "vehicleCount", 72, "avgSpeed", 58, "occupancy", 0.62, "eventCount", 1);

    public RuntimeStore() {
        bridges.put(SeedData.BRIDGE_CODE, new LinkedHashMap<>(SeedData.bridge()));
        components.addAll(SeedData.components());
        SeedData.simPlans().forEach(p -> simPlans.put(String.valueOf(p.get("planCode")), new LinkedHashMap<>(p)));
    }

    public Map<String, Object> bootstrap() {
        Map<String, Object> data = new LinkedHashMap<>(SeedData.bootstrap());
        data.put("bridges", bridges);
        data.put("components", new ArrayList<>(components));
        data.put("simPlans", new ArrayList<>(simPlans.values()));
        Map<String, Object> m = new LinkedHashMap<>(SeedData.metrics());
        m.put("vehicleCount", trafficStat.get("vehicleCount"));
        m.put("avgSpeed", trafficStat.get("avgSpeed"));
        m.put("occupancy", trafficStat.get("occupancy"));
        data.put("metrics", m);
        return data;
    }

    public List<Map<String, Object>> bridges(int page, int size) {
        List<Map<String, Object>> all = new ArrayList<>(bridges.values());
        int from = Math.min(all.size(), (page - 1) * size);
        return all.subList(from, Math.min(all.size(), from + size));
    }

    public Map<String, Object> bridge(String code) { return bridges.get(code); }

    public Map<String, Object> upsertBridge(String code, Map<String, Object> body) {
        Map<String, Object> merged = new LinkedHashMap<>(SeedData.bridge());
        merged.putAll(body);
        merged.put("bridgeCode", code);
        merged.put("updateTime", System.currentTimeMillis());
        bridges.put(code, merged);
        log("BRG", "UPSERT_BRIDGE", code);
        return merged;
    }

    public boolean deleteBridge(String code) {
        boolean ok = bridges.remove(code) != null;
        log("BRG", "DELETE_BRIDGE", code);
        return ok;
    }

    public List<Map<String, Object>> components(String type) {
        if (type == null || type.isBlank()) return new ArrayList<>(components);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> c : components) if (type.equalsIgnoreCase(String.valueOf(c.get("compType")))) out.add(c);
        return out;
    }

    public Map<String, Object> component(String code) {
        return components.stream().filter(c -> code.equals(c.get("compCode"))).findFirst().orElse(null);
    }

    public Map<String, Object> upsertComponent(Map<String, Object> body) {
        String code = String.valueOf(body.getOrDefault("compCode", "CMP-" + UUID.randomUUID().toString().substring(0, 6)));
        Map<String, Object> merged = new LinkedHashMap<>(body);
        merged.put("compCode", code);
        components.removeIf(c -> code.equals(c.get("compCode")));
        components.add(merged);
        log("BRG", "UPSERT_COMPONENT", code);
        return merged;
    }

    /** BRG-010：模型资源登记（内存实现返回 MinIO 对象键与预签名 URL 占位） */
    public Map<String, Object> registerModel(Map<String, Object> body) {
        String fileName = String.valueOf(body.getOrDefault("fileName", "model.glb"));
        String code = "MDL-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        String key = "glb/" + fileName;
        Map<String, Object> model = SeedData.o(
                "modelCode", code, "modelName", fileName, "modelType", body.getOrDefault("modelType", "OTHER"),
                "fileSize", body.getOrDefault("fileSize", 0), "md5", body.getOrDefault("md5", ""),
                "objectKey", key, "publicUrl", "/models/" + fileName,
                "bucketName", "bridge-models", "isDraco", body.getOrDefault("isDraco", false),
                "lodLevel", body.getOrDefault("lodLevel", 0));
        log("SCN", "UPLOAD_MODEL", code);
        return model;
    }

    public List<Map<String, Object>> simPlans() { return new ArrayList<>(simPlans.values()); }

    public Map<String, Object> setPlan(String code, String status, Integer density) {
        Map<String, Object> plan = simPlans.computeIfAbsent(code, k -> new LinkedHashMap<>(SeedData.simPlans().get(0)));
        if (status != null) plan.put("status", status);
        if (density != null) {
            plan.put("densityPct", density);
            Map<String, Object> stat = new LinkedHashMap<>(trafficStat);
            stat.put("vehicleCount", Math.round(density * 1.16));
            stat.put("occupancy", Math.round(density) / 100.0);
            trafficStat = stat;
        }
        log("SIM", status == null ? "SET_DENSITY" : status, code);
        return plan;
    }

    public Map<String, Object> trafficStat() { return trafficStat; }

    public void replay(String code) { log("ANIM", "REPLAY", code); }

    public List<Map<String, Object>> operLogs() { return new ArrayList<>(operLogs); }

    private void log(String module, String action, String target) {
        operLogs.add(0, SeedData.o(
                "logCode", "LOG-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                "module", module, "action", action, "targetCode", target,
                "result", "SUCCESS", "operTime", System.currentTimeMillis()));
        if (operLogs.size() > 200) operLogs.remove(operLogs.size() - 1);
    }
}
