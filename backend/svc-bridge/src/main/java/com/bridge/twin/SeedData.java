package com.bridge.twin;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 与 deploy/postgres/init/02_seed.sql、前端 src/config/index.ts 三方同构的种子数据。
 * 内存仓储模式下由本类提供；cluster 模式下由 JdbcRepository 从 PostgreSQL 读取同结构数据。
 */
public final class SeedData {
    public static final String BRIDGE_CODE = "BR-DEMO-01";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final double[] LANE_OFFSETS = { -8.75, -5.25, -1.75, 1.75, 5.25, 8.75 };

    private SeedData() {}

    @SuppressWarnings("unchecked")
    static Map<String, Object> o(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    static Map<String, Object> v(double x, double y, double z) {
        return o("x", x, "y", y, "z", z);
    }

    static Object json(String s) {
        try { return MAPPER.readValue(s, Object.class); } catch (Exception e) { return List.of(); }
    }

    private static String pad(int n) { return String.format("%02d", n); }

    public static Map<String, Object> bridge() {
        return o(
                "bridgeCode", BRIDGE_CODE, "bridgeName", "滨江大桥", "projectNo", "BR-2026",
                "bridgeType", "CABLE_STAYED", "towerHeight", 216, "mainSpan", 480,
                "sideSpan", 180, "totalLength", 840, "deckWidth", 24, "cableCount", 72,
                "designLoadT", 55, "buildYear", 2031, "designLife", 100,
                "maintainLevel", "一级", "location", "示范市·滨江新区跨江段",
                "manageUnit", "市桥梁养护中心");
    }

    public static List<Map<String, Object>> cables() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int g = 1; g <= 72; g++) {
            int no = (g - 1) % 18 + 1;
            boolean leftTower = g <= 36;
            boolean leftFace = (g - 1) % 36 < 18;
            double tx = leftTower ? -240 : 240;
            double sign = leftTower ? 1 : -1;
            double z = leftFace ? -11 : 11;
            list.add(o(
                    "cableCode", "C-" + pad(g), "cableNo", no,
                    "towerSide", leftTower ? "L" : "R", "face", leftFace ? "LEFT" : "RIGHT",
                    "anchorTop", v(tx, 150 - (no - 1) * 4.2, z),
                    "anchorBottom", v(tx + sign * no * 12, 60, z),
                    "designForceMn", 1.280 + (no - 9) * 0.004,
                    "warnForceMn", 1.350, "alarmForceMn", 1.400));
        }
        return list;
    }

    public static List<Map<String, Object>> segments() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 1; i <= 42; i++) {
            list.add(o(
                    "segmentCode", "B-" + pad(i), "chainage", -420 + (i - 1) * 20 + 10,
                    "lengthM", 20, "cellCount", 4, "weightT", 320 + (i % 5) * 8,
                    "isClosure", i == 21 || i == 22, "sortNo", i));
        }
        return list;
    }

    public static List<Map<String, Object>> lanes() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            boolean up = i < 3;
            double off = LANE_OFFSETS[i];
            String pts = up
                    ? String.format("[[-420,58,%s],[-200,58,%s],[0,58,%s],[200,58,%s],[420,58,%s]]", off, off, off, off, off)
                    : String.format("[[420,58,%s],[200,58,%s],[0,58,%s],[-200,58,%s],[-420,58,%s]]", off, off, off, off, off);
            list.add(o(
                    "laneCode", up ? "LN-UP-" + (i + 1) : "LN-DN-" + (i - 2),
                    "laneName", (up ? "上行" : "下行") + (up ? i + 1 : i - 2) + "车道",
                    "direction", up ? "UP" : "DOWN",
                    "laneIndex", up ? i + 1 : i - 2,
                    "offsetM", off, "curvePoints", json(pts), "speedLimit", 80));
        }
        return list;
    }

    public static List<Map<String, Object>> components() {
        List<Map<String, Object>> list = new ArrayList<>();
        addComp(list, "TOWER-L", "1# 桥塔（左）", "TOWER", null, 1, -240, 0, 0, true);
        addComp(list, "TOWER-R", "2# 桥塔（右）", "TOWER", null, 2, 240, 0, 0, true);
        addComp(list, "PIER-L", "左塔桥墩", "PIER", "TOWER-L", 1, -240, 0, 0, true);
        addComp(list, "PIER-R", "右塔桥墩", "PIER", "TOWER-R", 2, 240, 0, 0, true);
        addComp(list, "FOOTING-L", "左承台", "FOOTING", "PIER-L", 1, -240, 0, 0, true);
        addComp(list, "FOOTING-R", "右承台", "FOOTING", "PIER-R", 2, 240, 0, 0, true);
        addComp(list, "GIRDER", "主梁（42 节段）", "GIRDER_SEGMENT", null, 3, 0, 58, 0, false);
        addComp(list, "INNER", "箱梁内部结构", "DIAPHRAGM", "GIRDER", 1, 0, 54, 0, true);
        addComp(list, "PAVEMENT", "桥面铺装", "PAVEMENT", "GIRDER", 2, 0, 58, 0, false);
        addComp(list, "RAILING", "护栏", "RAILING", "GIRDER", 3, 0, 58, 0, true);
        addComp(list, "BEARINGS", "支座组", "BEARING", "GIRDER", 4, 0, 54, 0, true);
        addComp(list, "SENSORS", "传感器组", "OTHER", "GIRDER", 5, 0, 54, 0, true);
        for (int i = 1; i <= 42; i++) {
            addComp(list, "B-" + pad(i), "箱梁节段 B-" + pad(i), "GIRDER_SEGMENT", "GIRDER",
                    10 + i, -420 + (i - 1) * 20 + 10, 58, 0, false);
        }
        for (int i = 1; i <= 72; i++) {
            addComp(list, "C-" + pad(i), "拉索 C-" + pad(i), "CABLE",
                    i <= 36 ? "TOWER-L" : "TOWER-R", 100 + i, 0, 60, 0, true);
        }
        return list;
    }

    private static void addComp(List<Map<String, Object>> list, String code, String name, String type,
                                String parent, int sort, double x, double y, double z, boolean clipExempt) {
        list.add(o(
                "compCode", code, "compName", name, "compType", type, "parentCode", parent,
                "sortNo", sort, "material", type.equals("CABLE") ? "镀锌钢丝" : "C50 混凝土",
                "clipExempt", clipExempt, "visible", true,
                "modelSkeletonCode", "MDL-" + code + "-SK", "modelSolidCode", "MDL-" + code,
                "modelInnerCode", type.equals("GIRDER_SEGMENT") ? "MDL-GIRDER-IN" : null,
                "pos", v(x, y, z)));
    }

    public static List<Map<String, Object>> viewpoints() {
        return List.of(
                o("vpCode", "VP-OVERVIEW", "vpName", "全景鸟瞰", "camPos", v(420, 180, 520), "camTarget", v(0, 58, 0), "fov", 40),
                o("vpCode", "VP-DECK", "vpName", "桥面平视", "camPos", v(-380, 62, 2), "camTarget", v(300, 60, 0), "fov", 45),
                o("vpCode", "VP-UNDER", "vpName", "桥底剖切", "camPos", v(60, 8, 120), "camTarget", v(0, 52, 0), "fov", 40),
                o("vpCode", "VP-TOWER", "vpName", "塔柱特写", "camPos", v(180, 140, 160), "camTarget", v(0, 110, 0), "fov", 35),
                o("vpCode", "VP-ISO", "vpName", "等轴测", "camPos", v(520, 300, 520), "camTarget", v(0, 50, 0), "fov", 40),
                o("vpCode", "VP-SIDE", "vpName", "桥侧远景", "camPos", v(600, 120, 600), "camTarget", v(0, 70, 0), "fov", 40));
    }

    public static List<Map<String, Object>> clipPlans() {
        return List.of(
                o("planCode", "CLIP-AXIAL", "planName", "沿桥轴剖切", "normal", v(-1, 0, 0),
                        "clipDistance", 0, "showRebar", true, "showDiaphragm", true, "showStiffener", true,
                        "edgeColor", "#00E5FF", "isDefault", true),
                o("planCode", "CLIP-CROSS", "planName", "横向剖切", "normal", v(0, 0, -1),
                        "clipDistance", 0, "showRebar", true, "showDiaphragm", true, "showStiffener", true,
                        "edgeColor", "#00E5FF", "isDefault", false));
    }

    public static List<Map<String, Object>> animStages() {
        return List.of(
                o("stageCode", "ACT-1", "stageName", "骨架生成", "stageOrder", 1, "startMs", 0, "endMs", 4500,
                        "camKeyframes", json("[{\"t\":0,\"pos\":[600,120,600],\"target\":[0,70,0],\"fov\":40},{\"t\":4500,\"pos\":[420,180,520],\"target\":[0,70,0],\"fov\":40}]"),
                        "targetComps", json("[\"FOOTING-L\",\"TOWER-L\",\"GIRDER\"]"), "autoPlay", true),
                o("stageCode", "ACT-2", "stageName", "桥面合龙", "stageOrder", 2, "startMs", 4500, "endMs", 7500,
                        "camKeyframes", json("[{\"t\":0,\"pos\":[420,180,520],\"target\":[0,70,0],\"fov\":40},{\"t\":3000,\"pos\":[260,110,360],\"target\":[0,58,0],\"fov\":42}]"),
                        "targetComps", json("[\"GIRDER\",\"PAVEMENT\"]"), "autoPlay", true),
                o("stageCode", "ACT-3", "stageName", "车辆加载", "stageOrder", 3, "startMs", 7500, "endMs", 9500,
                        "camKeyframes", json("[{\"t\":0,\"pos\":[260,110,360],\"target\":[0,58,0],\"fov\":42},{\"t\":2000,\"pos\":[-380,62,2],\"target\":[300,60,0],\"fov\":45}]"),
                        "targetComps", json("[\"PAVEMENT\",\"VEHICLES\"]"), "autoPlay", true),
                o("stageCode", "ACT-4", "stageName", "结构透视", "stageOrder", 4, "startMs", 9500, "endMs", 12500,
                        "camKeyframes", json("[{\"t\":0,\"pos\":[-380,62,2],\"target\":[300,60,0],\"fov\":45},{\"t\":1300,\"pos\":[-160,24,180],\"target\":[0,52,0],\"fov\":42},{\"t\":3000,\"pos\":[60,8,120],\"target\":[0,52,0],\"fov\":40}]"),
                        "targetComps", json("[\"GIRDER\",\"INNER\",\"SENSORS\"]"), "autoPlay", true),
                o("stageCode", "ACT-5", "stageName", "稳态巡检", "stageOrder", 5, "startMs", 12500, "endMs", 0,
                        "camKeyframes", json("[{\"t\":0,\"pos\":[60,8,120],\"target\":[0,52,0],\"fov\":40}]"),
                        "targetComps", json("[\"SENSORS\"]"), "autoPlay", true));
    }

    public static List<Map<String, Object>> models() {
        return List.of(
                o("modelCode", "MDL-TOWER", "modelName", "tower_lod0.glb", "modelType", "TOWER", "publicUrl", "/models/tower_lod0.glb", "lodLevel", 0, "isDraco", true),
                o("modelCode", "MDL-GIRDER", "modelName", "girder_shell.glb", "modelType", "GIRDER", "publicUrl", "/models/girder_shell.glb", "lodLevel", 0, "isDraco", true),
                o("modelCode", "MDL-GIRDER-IN", "modelName", "girder_inner.glb", "modelType", "INNER", "publicUrl", "/models/girder_inner.glb", "lodLevel", 0, "isDraco", true),
                o("modelCode", "MDL-SECTION", "modelName", "girder_section.glb", "modelType", "INNER", "publicUrl", "/models/girder_section.glb", "lodLevel", 0, "isDraco", true),
                o("modelCode", "MDL-CABLES", "modelName", "cables.glb", "modelType", "CABLE", "publicUrl", "/models/cables.glb", "lodLevel", 0, "isDraco", true),
                o("modelCode", "MDL-PIER", "modelName", "piers_supports.glb", "modelType", "PIER", "publicUrl", "/models/piers_supports.glb", "lodLevel", 0, "isDraco", true),
                o("modelCode", "MDL-CAR-A", "modelName", "car_a.glb", "modelType", "VEHICLE", "publicUrl", "/models/car_a.glb", "lodLevel", 0, "isDraco", false),
                o("modelCode", "MDL-CAR-B", "modelName", "car_b.glb", "modelType", "VEHICLE", "publicUrl", "/models/car_b.glb", "lodLevel", 0, "isDraco", false));
    }

    public static List<Map<String, Object>> pointTypes() {
        return List.of(
                o("ptypeCode", "STRESS", "ptypeName", "结构应力", "unit", "MPa", "decimals", 1, "color", "#00E5FF", "sortNo", 1),
                o("ptypeCode", "CABLE_FORCE", "ptypeName", "索力", "unit", "kN", "decimals", 0, "color", "#2C7BE5", "sortNo", 2),
                o("ptypeCode", "DEFLECTION", "ptypeName", "挠度", "unit", "m", "decimals", 2, "color", "#2ED47A", "sortNo", 3),
                o("ptypeCode", "FREQUENCY", "ptypeName", "振动频率", "unit", "Hz", "decimals", 2, "color", "#FFB444", "sortNo", 4),
                o("ptypeCode", "DAMPING", "ptypeName", "阻尼比", "unit", "%", "decimals", 1, "color", "#7B8CFF", "sortNo", 5),
                o("ptypeCode", "TEMPERATURE", "ptypeName", "温度", "unit", "℃", "decimals", 1, "color", "#FF8A1E", "sortNo", 6),
                o("ptypeCode", "WIND_SPEED", "ptypeName", "风速", "unit", "m/s", "decimals", 1, "color", "#4DA3FF", "sortNo", 7),
                o("ptypeCode", "BEARING_DISP", "ptypeName", "支座位移", "unit", "mm", "decimals", 2, "color", "#F2C14E", "sortNo", 8),
                o("ptypeCode", "CRACK", "ptypeName", "裂缝宽度", "unit", "mm", "decimals", 2, "color", "#FF4D4F", "sortNo", 9));
    }

    /** 150 个测点：72 索力 + 42 应变 + 36 环境/变形/支座/裂缝 */
    public static List<Map<String, Object>> points() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 1; i <= 72; i++) {
            double x = (i <= 36 ? -240 : 240) + (i <= 36 ? 1 : -1) * (((i - 1) % 18) + 1) * 12;
            list.add(o("pointCode", "PTS-C-" + pad(i), "pointName", "C-" + pad(i) + " 索力",
                    "compCode", "C-" + pad(i), "ptypeCode", "CABLE_FORCE", "unit", "MN", "decimals", 3,
                    "warnMax", i == 3 ? 1.360 : 1.350, "alarmMax", 1.400, "groupCode", "TOWER",
                    "sortNo", i, "pos", v(x, 60, ((i - 1) % 36 < 18) ? -11 : 11), "showIn3d", true));
        }
        for (int i = 1; i <= 42; i++) {
            list.add(o("pointCode", "PTS-STR-" + pad(i), "pointName", "B-" + pad(i) + " 应变",
                    "compCode", "B-" + pad(i), "ptypeCode", "STRESS", "unit", "MPa", "decimals", 1,
                    "warnMax", 55, "alarmMax", 70, "groupCode", "GIRDER",
                    "sortNo", 100 + i, "pos", v(-420 + (i - 1) * 20 + 10, 53.5, 8), "showIn3d", true));
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
                double x = -420 + (i * 840.0) / (count + 1);
                list.add(o("pointCode", e[0] + "-" + pad(i), "pointName", e[0] + " " + pad(i),
                        "compCode", e[0].equals("PTS-BRG") ? "BEARINGS" : "GIRDER",
                        "ptypeCode", e[1], "unit", e[2], "decimals", Integer.parseInt(e[7]),
                        "warnMax", Double.parseDouble(e[3]), "alarmMax", Double.parseDouble(e[4]),
                        "groupCode", e[5], "sortNo", sort++, "pos", v(x, 53.5, i % 2 == 1 ? 8 : -8),
                        "showIn3d", true));
            }
        }
        return list;
    }

    public static Map<String, Object> inspection() {
        return o("inspectCode", "INS-2026-01", "scanProgress", 94, "defectCount", 2,
                "keyArea", "箱梁 B-03", "riskLevel", "低", "nextInspectDate", "2026-11-12");
    }

    public static List<Map<String, Object>> simPlans() {
        return List.of(o("planCode", "SIM-BRIDGE-01", "planName", "桥梁车流与监测联合仿真",
                "simType", "COUPLED", "densityPct", 62, "avgSpeed", 58, "vehicleMax", 36, "status", "IDLE"));
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

    public static Map<String, Object> bootstrap() {
        return o("bridge", bridge(), "components", components(), "cables", cables(),
                "segments", segments(), "lanes", lanes(), "viewpoints", viewpoints(),
                "clipPlans", clipPlans(), "animStages", animStages(), "models", models(),
                "pointTypes", pointTypes(), "points", points(), "inspection", inspection(),
                "simPlans", simPlans(), "metrics", metrics());
    }
}
