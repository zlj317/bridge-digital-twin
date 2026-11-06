package com.bridge.twin;

import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiConsumer;

import static com.bridge.twin.SeedDataMini.o;

/**
 * SHM-003~008 / ALM-001~006：清洗 → 实时缓存 → 阈值防抖 → 聚合 → 快照。
 * 默认内存实现（对应 Redis realtime:shm:* 与 TDengine shm_metric 的职责）；
 * cluster 模式下可把 writeHistory / writeRealtime 换成 Redis + TDengine 批量写入。
 */
@ApplicationScoped
public class RuntimeState {
    private final Map<String, Map<String, Object>> pointMeta = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> realtime = new ConcurrentHashMap<>();
    private final Map<String, ConcurrentLinkedDeque<double[]>> history = new ConcurrentHashMap<>();
    private final Map<String, Integer> overStreak = new ConcurrentHashMap<>();
    private final Map<String, Integer> normalStreak = new ConcurrentHashMap<>();
    private final List<Map<String, Object>> alarms = new CopyOnWriteArrayList<>();
    private volatile Map<String, Object> metrics = SeedDataMini.metrics();
    private volatile Map<String, Object> trafficStat = o("vehicleCount", 36, "avgSpeed", 58,
            "occupancy", 0.62, "eventCount", 1);
    private volatile BiConsumer<String, Object> publisher = (topic, payload) -> {};
    private volatile long accepted = 0;
    private volatile long rejected = 0;
    private volatile int debounceUp = 3;
    private volatile int debounceDown = 3;
    private volatile int overlimitLeft = 0;
    private final long startedAt = System.currentTimeMillis();

    public RuntimeState() {
        for (Map<String, Object> p : SeedDataMini.points()) {
            String code = String.valueOf(p.get("pointCode"));
            pointMeta.put(code, p);
            realtime.put(code, sample(code, SeedDataMini.initialValue(code), System.currentTimeMillis(), p));
            history.put(code, new ConcurrentLinkedDeque<>());
        }
    }

    public void configure(int up, int down, BiConsumer<String, Object> pub) {
        this.debounceUp = up;
        this.debounceDown = down;
        this.publisher = pub;
    }

    private Map<String, Object> sample(String code, double value, long ts, Map<String, Object> meta) {
        double warn = ((Number) meta.get("warnMax")).doubleValue();
        double alarm = ((Number) meta.get("alarmMax")).doubleValue();
        String level = value >= alarm ? "ALARM" : value >= warn ? "WARN" : "NORMAL";
        return o("pointCode", code, "compCode", meta.get("compCode"), "value", value,
                "unit", meta.get("unit"), "ts", ts, "level", level);
    }

    /** SHM-003：清洗入口，校验 pointCode / value 合法性 / 时间偏差，脏数据丢弃并计数 */
    public int ingest(List<Map<String, Object>> samples) {
        int ok = 0;
        long now = System.currentTimeMillis();
        for (Map<String, Object> s : samples) {
            Object codeObj = s.get("pointCode");
            Object valueObj = s.get("value");
            if (codeObj == null || !(valueObj instanceof Number num) || !Double.isFinite(num.doubleValue())) {
                rejected++;
                continue;
            }
            String code = String.valueOf(codeObj);
            Map<String, Object> meta = pointMeta.get(code);
            if (meta == null) { rejected++; continue; }
            long ts = s.get("ts") instanceof Number n ? n.longValue() : now;
            if (Math.abs(now - ts) > 300_000) { rejected++; continue; }
            double value = num.doubleValue();
            realtime.put(code, sample(code, value, ts, meta));
            ConcurrentLinkedDeque<double[]> q = history.get(code);
            q.addLast(new double[] { ts, value });
            if (q.size() > 3000) q.pollFirst();
            evaluateAlarm(code, value, meta, ts);
            ok++;
            accepted++;
        }
        recomputeMetrics();
        return ok;
    }

    /** ALM-001/002/004：连续 3 次超限触发、连续 3 次正常自动恢复 */
    private void evaluateAlarm(String code, double value, Map<String, Object> meta, long ts) {
        String level = String.valueOf(realtime.get(code).get("level"));
        if (!"NORMAL".equals(level)) {
            normalStreak.put(code, 0);
            int streak = overStreak.merge(code, 1, Integer::sum);
            if (streak >= debounceUp && activeAlarm(code) == null) {
                double warn = ((Number) meta.get("warnMax")).doubleValue();
                Map<String, Object> alarm = o(
                        "alarmCode", "ALM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                        "bridgeCode", SeedDataMini.BRIDGE_CODE, "compCode", meta.get("compCode"),
                        "pointCode", code, "alarmLevel", "ALARM".equals(level) ? "ALARM" : "WARN",
                        "title", meta.get("pointName") + " 超阈值告警",
                        "content", "测点 " + code + " 连续 " + streak + " 次超过阈值 " + warn + " " + meta.get("unit"),
                        "alarmValue", value, "thresholdValue", warn, "unit", meta.get("unit"),
                        "status", "ACTIVE", "triggerTime", Instant.ofEpochMilli(ts).toString());
                alarms.add(0, alarm);
                publisher.accept("alarm/bridge/event", alarm);
            }
        } else {
            overStreak.put(code, 0);
            int streak = normalStreak.merge(code, 1, Integer::sum);
            Map<String, Object> active = activeAlarm(code);
            if (streak >= debounceDown && active != null) {
                Map<String, Object> recovered = new LinkedHashMap<>(active);
                recovered.put("status", "RECOVERED");
                recovered.put("recoverTime", Instant.ofEpochMilli(ts).toString());
                alarms.replaceAll(a -> a == active ? recovered : a);
                publisher.accept("alarm/bridge/recover", recovered);
                normalStreak.put(code, 0);
            }
        }
    }

    private Map<String, Object> activeAlarm(String pointCode) {
        for (Map<String, Object> a : alarms) {
            if (pointCode.equals(a.get("pointCode")) && "ACTIVE".equals(a.get("status"))) return a;
        }
        return null;
    }

    /** 造超限数据（验收 F-09 / 顶栏「模拟告警」按钮） */
    public void injectOverlimit() { overlimitLeft = 3; }

    /** SHM-009：无外部仿真器时按物理规律生成平滑数据，保证 live 链路持续有值 */
    public void tickLocalSimulation() {
        double t = (System.currentTimeMillis() - startedAt) / 1000.0;
        List<Map<String, Object>> batch = new ArrayList<>();
        for (Map.Entry<String, Map<String, Object>> e : pointMeta.entrySet()) {
            String code = e.getKey();
            double base = SeedDataMini.initialValue(code);
            double amp = Math.max(0.0004, Math.abs(base) * 0.012);
            double phase = code.hashCode() % 97;
            double v = base + amp * Math.sin(t / 19 + phase) + amp * 0.22 * Math.sin(t / 3.7 + phase * 1.7);
            if (overlimitLeft > 0 && "PTS-STR-03".equals(code)) v = 58.6;
            batch.add(o("pointCode", code, "value", v, "ts", System.currentTimeMillis()));
        }
        if (overlimitLeft > 0) overlimitLeft--;
        ingest(batch);
    }

    /** SHM-007 指标聚合：结构应力取最大、索力取最大、挠度跨中、温度均值等 */
    private void recomputeMetrics() {
        double maxStress = 0, maxCable = 0, sumTemp = 0, sumWind = 0, sumFreq = 0, sumDamp = 0;
        int nTemp = 0, nWind = 0, nFreq = 0, nDamp = 0;
        double deflection = 0.86;
        for (Map<String, Object> s : realtime.values()) {
            String code = String.valueOf(s.get("pointCode"));
            double v = ((Number) s.get("value")).doubleValue();
            if (code.startsWith("PTS-STR-")) maxStress = Math.max(maxStress, v);
            else if (code.startsWith("PTS-C-")) maxCable = Math.max(maxCable, v);
            else if (code.startsWith("PTS-TMP-")) { sumTemp += v; nTemp++; }
            else if (code.startsWith("PTS-WND-")) { sumWind += v; nWind++; }
            else if (code.startsWith("PTS-FRQ-")) { sumFreq += v; nFreq++; }
            else if (code.startsWith("PTS-DMP-")) { sumDamp += v; nDamp++; }
            else if ("PTS-DEF-01".equals(code)) deflection = v;
        }
        boolean hasAlarm = alarms.stream().anyMatch(a -> "ACTIVE".equals(a.get("status")));
        Map<String, Object> m = new LinkedHashMap<>(SeedDataMini.metrics());
        m.put("stress", round(maxStress, 1));
        m.put("cableForce", Math.round(maxCable * 1000));
        m.put("deflection", round(deflection, 2));
        m.put("temperature", nTemp > 0 ? round(sumTemp / nTemp, 1) : 21.4);
        m.put("windSpeed", nWind > 0 ? round(sumWind / nWind, 1) : 3.2);
        m.put("frequency", nFreq > 0 ? round(sumFreq / nFreq, 2) : 0.48);
        m.put("damping", nDamp > 0 ? round(sumDamp / nDamp, 1) : 2.1);
        m.put("healthGrade", hasAlarm ? "B" : "A");
        m.put("healthScore", hasAlarm ? 88 : 96);
        m.put("eventCount", 1 + alarms.stream().filter(a -> "ACTIVE".equals(a.get("status"))).count());
        m.put("vehicleCount", trafficStat.get("vehicleCount"));
        m.put("avgSpeed", trafficStat.get("avgSpeed"));
        m.put("occupancy", trafficStat.get("occupancy"));
        m.put("ts", System.currentTimeMillis());
        metrics = m;
    }

    private static double round(double v, int d) {
        double p = Math.pow(10, d);
        return Math.round(v * p) / p;
    }

    public Map<String, Object> metrics() { return metrics; }

    public Map<String, Object> trafficStat() { return trafficStat; }

    public void setTrafficStat(Map<String, Object> stat) {
        this.trafficStat = new LinkedHashMap<>(stat);
        recomputeMetrics();
    }

    public List<Map<String, Object>> points(String group) {
        if (group == null || group.isBlank()) return new ArrayList<>(pointMeta.values());
        return pointMeta.values().stream().filter(p -> group.equalsIgnoreCase(String.valueOf(p.get("groupCode")))).toList();
    }

    public List<Map<String, Object>> realtimePoints() { return new ArrayList<>(realtime.values()); }

    public Map<String, Object> realtime(String code) { return realtime.get(code); }

    public Map<String, Object> snapshot() {
        Map<String, Object> snap = o("bridgeCode", SeedDataMini.BRIDGE_CODE,
                "ts", System.currentTimeMillis(), "metrics", metrics,
                "points", realtimePoints());
        publisher.accept("realtime/bridge/" + SeedDataMini.BRIDGE_CODE, snap);
        return snap;
    }

    public List<Map<String, Object>> alarms(String level, String status) {
        return alarms.stream()
                .filter(a -> level == null || level.isBlank() || level.equalsIgnoreCase(String.valueOf(a.get("alarmLevel"))))
                .filter(a -> status == null || status.isBlank() || status.equalsIgnoreCase(String.valueOf(a.get("status"))))
                .toList();
    }

    public Map<String, Object> setAlarmStatus(String code, String status) {
        for (Map<String, Object> a : alarms) {
            if (code.equals(a.get("alarmCode"))) {
                Map<String, Object> updated = new LinkedHashMap<>(a);
                updated.put("status", status);
                updated.put("confirmTime", Instant.ofEpochMilli(System.currentTimeMillis()).toString());
                alarms.replaceAll(x -> x == a ? updated : x);
                return updated;
            }
        }
        return null;
    }

    public Map<String, Object> health() {
        return o("score", metrics.get("healthScore"), "grade", metrics.get("healthGrade"),
                "activeAlarms", alarms.stream().filter(a -> "ACTIVE".equals(a.get("status"))).count(),
                "updatedAt", System.currentTimeMillis());
    }

    /** RPT-001 时序查询：按降采样间隔聚合；无历史时用平滑序列回填，保证回放无空洞 */
    public List<Map<String, Object>> series(String pointsCsv, long start, long end, long intervalMs, String aggr) {
        if (end <= start) end = start + 3_600_000L;
        if (intervalMs <= 0) intervalMs = 10_000L;
        List<Map<String, Object>> out = new ArrayList<>();
        for (String code : pointsCsv.split(",")) {
            code = code.trim();
            Map<String, Object> meta = pointMeta.get(code);
            if (meta == null) continue;
            List<double[]> raw = new ArrayList<>();
            for (double[] p : history.getOrDefault(code, new ConcurrentLinkedDeque<>())) {
                if (p[0] >= start && p[0] <= end) raw.add(p);
            }
            if (raw.isEmpty()) {
                long step = Math.max(intervalMs, Math.max(1000L, (end - start) / 240));
                double base = SeedDataMini.initialValue(code);
                for (long ts = start; ts <= end; ts += step) {
                    double v = base + Math.max(0.0004, Math.abs(base) * 0.012)
                            * Math.sin((ts - start) / 3_600_000.0 * Math.PI * 2 + code.length());
                    raw.add(new double[] { ts, v });
                }
            }
            Map<Long, List<Double>> buckets = new LinkedHashMap<>();
            for (double[] p : raw) {
                long bucket = ((long) (p[0] / intervalMs)) * intervalMs;
                buckets.computeIfAbsent(bucket, k -> new ArrayList<>()).add(p[1]);
            }
            List<List<Number>> pts = new ArrayList<>();
            buckets.forEach((ts, values) -> {
                double v = switch (String.valueOf(aggr).toUpperCase()) {
                    case "MAX" -> values.stream().mapToDouble(Double::doubleValue).max().orElse(0);
                    case "MIN" -> values.stream().mapToDouble(Double::doubleValue).min().orElse(0);
                    default -> values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
                };
                pts.add(List.of(ts, round(v, 4)));
            });
            out.add(o("pointCode", code, "unit", meta.get("unit"), "points", pts));
        }
        return out;
    }

    /** RPT-003 区间统计：最大/最小/均值/P95/超限次数 */
    public Map<String, Object> statistics(String code, long start, long end) {
        List<Map<String, Object>> s = series(code, start, end, 10_000L, "AVG");
        List<Double> vals = new ArrayList<>();
        if (!s.isEmpty()) {
            @SuppressWarnings("unchecked")
            List<List<Number>> pts = (List<List<Number>>) s.get(0).get("points");
            pts.forEach(p -> vals.add(p.get(1).doubleValue()));
        }
        vals.sort(Comparator.naturalOrder());
        if (vals.isEmpty()) vals.add(0.0);
        double avg = vals.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        Map<String, Object> meta = pointMeta.get(code);
        double warn = meta == null ? Double.MAX_VALUE : ((Number) meta.get("warnMax")).doubleValue();
        return o("pointCode", code, "count", vals.size(), "max", vals.get(vals.size() - 1),
                "min", vals.get(0), "avg", round(avg, 4),
                "p95", vals.get((int) (vals.size() * 0.95)),
                "exceedCount", vals.stream().filter(v -> v > warn).count());
    }

    public Map<String, Object> snapshotAt(long t) {
        return o("t", t, "metrics", metrics, "points", realtimePoints(), "traffic", trafficStat);
    }

    public Map<String, Object> ingestStats() {
        return o("accepted", accepted, "rejected", rejected, "points", pointMeta.size(),
                "historyRows", history.values().stream().mapToInt(ConcurrentLinkedDeque::size).sum());
    }
}
