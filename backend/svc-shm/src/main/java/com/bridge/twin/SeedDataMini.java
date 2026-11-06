package com.bridge.twin;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 与 02_seed.sql / 前端 config 同构的测点与指标初值（svc-shm 侧精简副本） */
public final class SeedDataMini {
    public static final String BRIDGE_CODE = "BR-DEMO-01";
    private static final double[] CABLE_VALUES = { 1.290, 1.286, 1.302, 1.278, 1.294, 1.288 };

    private SeedDataMini() {}

    static Map<String, Object> o(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    private static String pad(int n) { return String.format("%02d", n); }

    public static List<Map<String, Object>> points() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 1; i <= 72; i++) {
            list.add(o("pointCode", "PTS-C-" + pad(i), "pointName", "C-" + pad(i) + " 索力",
                    "compCode", "C-" + pad(i), "ptypeCode", "CABLE_FORCE", "unit", "MN", "decimals", 3,
                    "warnMax", i == 3 ? 1.360 : 1.350, "alarmMax", 1.400, "groupCode", "TOWER",
                    "sortNo", i, "pos", o("x", 0, "y", 60, "z", 0), "showIn3d", true));
        }
        for (int i = 1; i <= 42; i++) {
            list.add(o("pointCode", "PTS-STR-" + pad(i), "pointName", "B-" + pad(i) + " 应变",
                    "compCode", "B-" + pad(i), "ptypeCode", "STRESS", "unit", "MPa", "decimals", 1,
                    "warnMax", 55, "alarmMax", 70, "groupCode", "GIRDER",
                    "sortNo", 100 + i, "pos", o("x", -410 + i * 20, "y", 53.5, "z", 8), "showIn3d", true));
        }
        String[][] extra = {
                { "PTS-DEF", "DEFLECTION", "m", "1.2", "1.5", "GIRDER", "8", "2" },
                { "PTS-TMP", "TEMPERATURE", "℃", "40", "50", "ENV", "6", "1" },
                { "PTS-WND", "WIND_SPEED", "m/s", "18", "25", "ENV", "4", "1" },
                { "PTS-FRQ", "FREQUENCY", "Hz", "0.9", "1.2", "GIRDER", "4", "2" },
                { "PTS-DMP", "DAMPING", "%", "4", "5", "GIRDER", "4", "1" },
                { "PTS-BRG", "BEARING_DISP", "mm", "25", "40", "BEARING", "6", "2" },
                { "PTS-CRK", "CRACK", "mm", "0.2", "0.3", "GIRDER", "4", "2" },
        };
        int sort = 200;
        for (String[] e : extra) {
            int count = Integer.parseInt(e[6]);
            for (int i = 1; i <= count; i++) {
                list.add(o("pointCode", e[0] + "-" + pad(i), "pointName", e[0] + " " + pad(i),
                        "compCode", e[0].equals("PTS-BRG") ? "BEARINGS" : "GIRDER",
                        "ptypeCode", e[1], "unit", e[2], "decimals", Integer.parseInt(e[7]),
                        "warnMax", Double.parseDouble(e[3]), "alarmMax", Double.parseDouble(e[4]),
                        "groupCode", e[5], "sortNo", sort++, "pos", o("x", -420 + i * 100, "y", 53.5, "z", 0),
                        "showIn3d", true));
            }
        }
        return list;
    }

    public static double initialValue(String code) {
        if (code.startsWith("PTS-C-")) {
            int n = Integer.parseInt(code.substring(6));
            return n <= 6 ? CABLE_VALUES[n - 1] : 1.290 + ((n % 7) - 3) * 0.002;
        }
        if (code.startsWith("PTS-STR-")) return 42.0;
        if (code.startsWith("PTS-DEF-")) return 0.86;
        if (code.startsWith("PTS-TMP-")) return 21.4;
        if (code.startsWith("PTS-WND-")) return 3.2;
        if (code.startsWith("PTS-FRQ-")) return 0.48;
        if (code.startsWith("PTS-DMP-")) return 2.1;
        if (code.startsWith("PTS-BRG-")) return 12.0;
        if (code.startsWith("PTS-CRK-")) return 0.08;
        return 0;
    }

    public static Map<String, Object> metrics() {
        return o("stress", 42.0, "cableForce", 1280, "deflection", 0.86, "temperature", 21.4,
                "windSpeed", 3.2, "frequency", 0.48, "damping", 2.1, "trafficPerHour", 1286,
                "fatigueIndex", 38, "healthGrade", "A", "healthScore", 96,
                "vehicleCount", 36, "avgSpeed", 58, "occupancy", 0.62, "eventCount", 1,
                "scanProgress", 94, "defectCount", 2, "keyArea", "箱梁 B-03", "riskLevel", "低",
                "nextInspectDate", "2026-11-12", "maintenanceAdvice", "检查箱梁 B-03",
                "ts", System.currentTimeMillis());
    }

    public static Map<String, Object> inspection() {
        return o("inspectCode", "INS-2026-01", "scanProgress", 94, "defectCount", 2,
                "keyArea", "箱梁 B-03", "riskLevel", "低", "nextInspectDate", "2026-11-12",
                "inspectDate", "2026-10-12", "inspectType", "SCAN");
    }
}
