-- ============================================================================
-- 智慧桥梁数字孪生系统  初始化种子数据
-- 版本 V1.0 ｜ 依赖 01_schema.sql
-- 数据与三张效果图完全一致：BR-2026 / 斜拉桥 / 塔高216m / 主跨480m / 拉索72根
--                        箱梁宽24m / 设计荷载55t / 2031建成 / 寿命100年 / 养护一级
-- ============================================================================

SET TIME ZONE 'UTC';

-- ---------------------------------------------------------------- 1. 桥梁档案
INSERT INTO brg_bridge (bridge_code, bridge_name, project_no, bridge_type, tower_height, main_span,
                        side_span, total_length, deck_width, cable_count, design_load_t, build_year,
                        design_life, maintain_level, location, manage_unit)
VALUES ('BR-DEMO-01','滨江大桥','BR-2026','CABLE_STAYED',216,480,180,840,24,72,55,2031,100,'一级',
        '示范市·滨江新区跨江段','市桥梁养护中心')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 2. 箱梁节段（42 个，每 20m）
INSERT INTO brg_girder_segment (bridge_code, segment_code, chainage, length_m, section_type,
                                cell_count, top_slab_mm, bottom_slab_mm, web_mm, weight_t, is_closure, sort_no)
SELECT 'BR-DEMO-01',
       'B-' || lpad(i::text, 2, '0'),
       -410 + (i-1)*20,
       20,
       'MULTI_CELL_BOX',
       4,
       320, 280, 400,
       round((280 + (i % 7) * 6)::numeric, 1),
       (i = 21),
       i
FROM generate_series(1, 42) AS i
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 3. 构件树（顶层构件）
INSERT INTO brg_component (bridge_code, comp_code, comp_name, comp_type, parent_code, sort_no,
                           material, design_param, weight_t, model_solid_code, clip_exempt)
VALUES
('BR-DEMO-01','TOWER-L','左塔','TOWER',NULL,1,'C50混凝土','门型双柱塔，高216m',12800,'MDL-TOWER-L',true),
('BR-DEMO-01','TOWER-R','右塔','TOWER',NULL,2,'C50混凝土','门型双柱塔，高216m',12800,'MDL-TOWER-R',true),
('BR-DEMO-01','GIRDER','主梁（箱梁）','GIRDER_SEGMENT',NULL,3,'C55混凝土','四室箱梁，宽24m，节段长20m',42000,'MDL-GIRDER',false),
('BR-DEMO-01','PIER-L1','左1#桥墩','PIER','TOWER-L',1,'C40混凝土','矩形墩，高58m',3600,'MDL-PIER',true),
('BR-DEMO-01','PIER-R1','右1#桥墩','PIER','TOWER-R',1,'C40混凝土','矩形墩，高58m',3600,'MDL-PIER',true),
('BR-DEMO-01','FOOT-L','左承台','FOOTING','TOWER-L',2,'C35混凝土','承台 18×12×4m',2100,'MDL-FOOTING',true),
('BR-DEMO-01','FOOT-R','右承台','FOOTING','TOWER-R',2,'C35混凝土','承台 18×12×4m',2100,'MDL-FOOTING',true),
('BR-DEMO-01','BEAR-01','1#支座','BEARING','GIRDER',1,'球型钢支座','竖向承载力 8000kN',3.2,'MDL-BEARING',false),
('BR-DEMO-01','BEAR-02','2#支座','BEARING','GIRDER',2,'球型钢支座','竖向承载力 8000kN',3.2,'MDL-BEARING',false),
('BR-DEMO-01','BEAR-03','3#支座','BEARING','GIRDER',3,'球型钢支座','竖向承载力 8000kN',3.2,'MDL-BEARING',false),
('BR-DEMO-01','BEAR-04','4#支座','BEARING','GIRDER',4,'球型钢支座','竖向承载力 8000kN',3.2,'MDL-BEARING',false),
('BR-DEMO-01','RAIL-01','桥面护栏','RAILING','GIRDER',5,'Q355钢','双侧防撞护栏，高1.4m',420,'MDL-RAILING',false),
('BR-DEMO-01','PAVE-01','桥面铺装','PAVEMENT','GIRDER',6,'沥青玛蹄脂','厚 80mm',5600,'MDL-PAVEMENT',false)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 4. 拉索（72 根：2塔 × 2索面 × 18根）
INSERT INTO brg_cable (bridge_code, cable_code, cable_no, tower_side, face,
                       anchor_top_x, anchor_top_y, anchor_bottom_x, anchor_bottom_y,
                       design_force_mn, warn_force_mn, alarm_force_mn, tension_date)
SELECT 'BR-DEMO-01',
       'C-' || lpad(rn::text, 2, '0'),
       rn,
       tower_side,
       face,
       tower_x,
       216 - (k-1)*3,
       tower_x + dir * (20 + (k-1)*18),
       58,
       round((1.28 + (k % 5) * 0.006)::numeric, 3),
       1.350,
       1.400,
       DATE '2031-06-01'
FROM (
    SELECT v.tower_side, f.face, k, v.tower_x, v.dir,
           row_number() OVER (ORDER BY v.tower_side, f.face, k) AS rn
    FROM (VALUES ('L', -240.0::float8, -1.0::float8), ('R', 240.0::float8, 1.0::float8))
             AS v(tower_side, tower_x, dir)
    CROSS JOIN (SELECT 'LEFT' AS face UNION ALL SELECT 'RIGHT' AS face) AS f
    CROSS JOIN generate_series(1, 18) AS k
) s
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 5. 车道（6 条）
INSERT INTO brg_lane (bridge_code, lane_code, lane_name, direction, lane_index, offset_m, curve_points, speed_limit)
VALUES
('BR-DEMO-01','LN-UP-1','上行1车道','UP',  1,-8.75,'[[-420,58,-8.75],[-200,58,-8.75],[0,58,-8.75],[200,58,-8.75],[420,58,-8.75]]',80),
('BR-DEMO-01','LN-UP-2','上行2车道','UP',  2,-5.25,'[[-420,58,-5.25],[-200,58,-5.25],[0,58,-5.25],[200,58,-5.25],[420,58,-5.25]]',80),
('BR-DEMO-01','LN-UP-3','上行3车道','UP',  3,-1.75,'[[-420,58,-1.75],[-200,58,-1.75],[0,58,-1.75],[200,58,-1.75],[420,58,-1.75]]',80),
('BR-DEMO-01','LN-DN-1','下行1车道','DOWN',1, 1.75,'[[420,58,1.75],[200,58,1.75],[0,58,1.75],[-200,58,1.75],[-420,58,1.75]]',80),
('BR-DEMO-01','LN-DN-2','下行2车道','DOWN',2, 5.25,'[[420,58,5.25],[200,58,5.25],[0,58,5.25],[-200,58,5.25],[-420,58,5.25]]',80),
('BR-DEMO-01','LN-DN-3','下行3车道','DOWN',3, 8.75,'[[420,58,8.75],[200,58,8.75],[0,58,8.75],[-200,58,8.75],[-420,58,8.75]]',80)
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN brg_lane.curve_points IS '控制点 [[x,y,z],...]；y 为桥面标高58，z 为横向偏移（桥轴沿X，宽向为Z）';

-- ---------------------------------------------------------------- 6. 视点
INSERT INTO brg_viewpoint (bridge_code, vp_code, vp_name, cam_pos, cam_target, fov, sort_no) VALUES
('BR-DEMO-01','VP-OVERVIEW','全景鸟瞰',  '{"x":420,"y":180,"z":520}', '{"x":0,"y":58,"z":0}', 40, 1),
('BR-DEMO-01','VP-DECK',    '桥面平视',  '{"x":-380,"y":62,"z":2}',  '{"x":300,"y":60,"z":0}',45, 2),
('BR-DEMO-01','VP-UNDER',   '桥底剖切',  '{"x":60,"y":8,"z":120}',   '{"x":0,"y":52,"z":0}',  40, 3),
('BR-DEMO-01','VP-TOWER',   '塔柱特写',  '{"x":180,"y":140,"z":160}','{"x":0,"y":110,"z":0}', 35, 4)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 7. 五幕动画
INSERT INTO brg_anim_stage (bridge_code, stage_code, stage_name, stage_order, start_ms, end_ms, auto_play) VALUES
('BR-DEMO-01','ACT-1','骨架生成',1,     0,  4500, true),
('BR-DEMO-01','ACT-2','桥面合龙',2,  4500,  7500, true),
('BR-DEMO-01','ACT-3','车辆加载',3,  7500,  9500, true),
('BR-DEMO-01','ACT-4','结构透视',4,  9500, 12500, true),
('BR-DEMO-01','ACT-5','稳态巡检',5, 12500,     0, true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 8. 剖切方案
INSERT INTO brg_clip_plan (bridge_code, plan_code, plan_name, normal_x, normal_y, normal_z,
                           clip_distance, show_rebar, show_diaphragm, show_stiffener, edge_color, is_default)
VALUES
('BR-DEMO-01','CLIP-AXIAL','沿桥轴剖切',-1,0, 0, 0, true, true, true, '#00E5FF', true),
('BR-DEMO-01','CLIP-CROSS','横向剖切',   0,0,-1, 0, true, true, true, '#00E5FF', false)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 9. 测点类型
INSERT INTO shm_point_type (ptype_code, ptype_name, unit, decimals, color, sort_no) VALUES
('STRESS',      '结构应力',  'MPa',  1, '#00E5FF', 1),
('CABLE_FORCE', '索力',      'kN',   0, '#2C7BE5', 2),
('DEFLECTION',  '挠度',      'm',    2, '#2ED47A', 3),
('FREQUENCY',   '振动频率',  'Hz',   2, '#FFB444', 4),
('DAMPING',     '阻尼比',    '%',    1, '#7B8CFF', 5),
('TEMPERATURE', '温度',      '℃',    1, '#FF8A1E', 6),
('WIND_SPEED',  '风速',      'm/s',  1, '#4DA3FF', 7),
('BEARING_DISP','支座位移',  'mm',   2, '#F2C14E', 8),
('CRACK',       '裂缝宽度',  'mm',   2, '#FF4D4F', 9)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 10. 索力测点（72 个）
INSERT INTO shm_point (bridge_code, comp_code, point_code, point_name, ptype_code, unit, decimals,
                       warn_min, warn_max, alarm_min, alarm_max, show_in_3d, group_code, sort_no,
                       pos_x, pos_y, pos_z)
SELECT 'BR-DEMO-01',
       c.cable_code,
       'PTS-' || c.cable_code,
       c.cable_code || ' 索力',
       'CABLE_FORCE',
       'kN', 0,
       0, 1350, 0, 1400,
       true, 'TOWER', c.cable_no,
       c.anchor_bottom_x, 200, 0
FROM brg_cable c
WHERE c.bridge_code = 'BR-DEMO-01'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 11. 主梁应变测点（42 个）
INSERT INTO shm_point (bridge_code, comp_code, point_code, point_name, ptype_code, unit, decimals,
                       warn_min, warn_max, alarm_min, alarm_max, show_in_3d, group_code, sort_no,
                       pos_x, pos_y, pos_z)
SELECT 'BR-DEMO-01',
       s.segment_code,
       'PTS-STR-' || s.segment_code,
       s.segment_code || ' 底板应变',
       'STRESS',
       'MPa', 1,
       0, 55, 0, 60,
       true, 'GIRDER', s.sort_no,
       s.chainage, 46, 0
FROM brg_girder_segment s
WHERE s.bridge_code = 'BR-DEMO-01'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 12. 支座位移测点（4 个）
INSERT INTO shm_point (bridge_code, comp_code, point_code, point_name, ptype_code, unit, decimals,
                       warn_min, warn_max, alarm_min, alarm_max, show_in_3d, group_code, sort_no, pos_x, pos_y, pos_z)
VALUES
('BR-DEMO-01','BEAR-01','PTS-BEAR-01','1#支座位移','BEARING_DISP','mm',2, -20, 20, -25, 25, true,'BEARING',1,-240,56,0),
('BR-DEMO-01','BEAR-02','PTS-BEAR-02','2#支座位移','BEARING_DISP','mm',2, -20, 20, -25, 25, true,'BEARING',2,-120,56,0),
('BR-DEMO-01','BEAR-03','PTS-BEAR-03','3#支座位移','BEARING_DISP','mm',2, -20, 20, -25, 25, true,'BEARING',3, 120,56,0),
('BR-DEMO-01','BEAR-04','PTS-BEAR-04','4#支座位移','BEARING_DISP','mm',2, -20, 20, -25, 25, true,'BEARING',4, 240,56,0)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 13. 环境与整体指标测点（5 个）
INSERT INTO shm_point (bridge_code, comp_code, point_code, point_name, ptype_code, unit, decimals,
                       warn_min, warn_max, alarm_min, alarm_max, show_in_3d, group_code, sort_no, pos_x, pos_y, pos_z)
VALUES
('BR-DEMO-01','TOWER-L','PTS-ENV-TEMP', '环境温度',   'TEMPERATURE','℃',  1, -10, 35, -20, 40, false,'ENV',1, 0, 60, 0),
('BR-DEMO-01','TOWER-L','PTS-ENV-WIND', '桥面风速',   'WIND_SPEED', 'm/s',1, 0,   20,  0,  25, false,'ENV',2, 0, 70, 0),
('BR-DEMO-01','TOWER-L','PTS-ENV-FREQ', '振动频率',   'FREQUENCY',  'Hz', 2, 0.2, 1.0, 0.1, 1.5,false,'ENV',3, 0, 60, 0),
('BR-DEMO-01','TOWER-L','PTS-ENV-DAMP', '阻尼比',     'DAMPING',    '%',  1, 1.0, 5.0, 0.5, 8.0,false,'ENV',4, 0, 60, 0),
('BR-DEMO-01','GIRDER','PTS-ENV-DEFL',  '跨中挠度',   'DEFLECTION', 'm',  2, 0,   1.20, 0, 1.50,true, 'ENV',5, 0, 58, 0)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 14. 巡检记录（右栏「检测与预警」）
INSERT INTO shm_inspection (bridge_code, inspect_code, inspect_type, scan_progress, defect_count,
                            key_area, risk_level, next_inspect_date, inspect_date, inspector)
VALUES ('BR-DEMO-01','INS-2026-01','SCAN',94.00,2,'箱梁B-03','低',DATE '2026-11-12',DATE '2026-10-12','李工')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 15. 仿真方案（对应底部滑块：62% / 58km/h / 36辆）
INSERT INTO sim_plan (bridge_code, plan_code, plan_name, sim_type, density_pct, avg_speed, vehicle_max, duration_s)
VALUES ('BR-DEMO-01','SIM-BRIDGE-01','桥梁车流与监测联合仿真','COUPLED',62,58,36,600)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 16. 系统配置
INSERT INTO sys_config (config_key, config_value, config_group, value_type, description) VALUES
('mqtt.broker.url',      'tcp://emqx:1883',              'MQTT', 'STRING','服务端 MQTT 地址'),
('mqtt.ws.url',          'ws://localhost:8083/mqtt',     'MQTT', 'STRING','前端 MQTT over WS 地址'),
('mqtt.topic.raw',       'sensor/raw/bridge/',           'MQTT', 'STRING','SHM 原始上报前缀'),
('mqtt.topic.traffic',   'traffic/vehicle/',             'MQTT', 'STRING','车流状态主题前缀'),
('mqtt.topic.realtime',  'realtime/bridge/',             'MQTT', 'STRING','整桥快照主题前缀'),
('alarm.debounce.up',    '3',                            'ALARM','NUMBER','连续超限次数才告警'),
('alarm.debounce.down',  '3',                            'ALARM','NUMBER','连续正常次数才恢复'),
('cache.realtime.ttl',   '300',                          'CACHE','NUMBER','实时值缓存 TTL（秒）'),
('anim.total.duration',  '12500',                        'WEB',  'NUMBER','五幕动画总时长（毫秒）'),
('traffic.density',      '62',                           'SIM',  'NUMBER','车流密度百分比'),
('traffic.avg.speed',    '58',                           'SIM',  'NUMBER','平均车速 km/h'),
('traffic.vehicle.max',  '36',                           'SIM',  'NUMBER','在途车辆上限')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 17. 默认用户（admin / admin123，BCrypt）
INSERT INTO sys_user (user_code, username, password, display_name, status)
VALUES ('U-ADMIN','admin','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','管理员','ENABLED')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 18. 模型资源占位（上传后回填 public_url）
INSERT INTO scn_model (model_code, model_name, model_type, file_name, object_key, lod_level, lod_group) VALUES
('MDL-TOWER-L',   '左塔-实体',   'TOWER',  'tower_lod0.glb',   'models/tower_lod0.glb',   0,'tower'),
('MDL-TOWER-R',   '右塔-实体',   'TOWER',  'tower_lod0.glb',   'models/tower_lod0.glb',   0,'tower'),
('MDL-GIRDER',    '主梁外壳',    'GIRDER', 'girder_shell.glb', 'models/girder_shell.glb',0,'girder'),
('MDL-INNER',     '箱梁内部',    'INNER',  'girder_inner.glb', 'models/girder_inner.glb',0,'inner'),
('MDL-PIER',      '桥墩',        'PIER',   'pier_lod0.glb',    'models/pier_lod0.glb',    0,'pier'),
('MDL-FOOTING',   '承台桩基',    'PIER',   'footing.glb',      'models/footing.glb',      0,'pier'),
('MDL-BEARING',   '支座',        'PART',   'bearing.glb',      'models/bearing.glb',      0,'bearing'),
('MDL-RAILING',   '护栏',        'PART',   'railing.glb',      'models/railing.glb',      0,'railing'),
('MDL-PAVEMENT',  '桥面铺装',    'PART',   'pavement.glb',     'models/pavement.glb',     0,'pavement'),
('MDL-CAR-A',     '小车',        'VEHICLE','car_a.glb',        'models/car_a.glb',        0,'car'),
('MDL-CAR-B',     '货车',        'VEHICLE','car_b.glb',        'models/car_b.glb',        0,'car')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 校验：
--   SELECT 'bridge', COUNT(*) FROM brg_bridge
--   UNION ALL SELECT 'component', COUNT(*) FROM brg_component
--   UNION ALL SELECT 'cable', COUNT(*) FROM brg_cable
--   UNION ALL SELECT 'segment', COUNT(*) FROM brg_girder_segment
--   UNION ALL SELECT 'lane', COUNT(*) FROM brg_lane
--   UNION ALL SELECT 'point', COUNT(*) FROM shm_point;
-- 期望：1 / 13 / 72 / 42 / 6 / 123
-- ============================================================================
-- （注：内容由AI生成）
